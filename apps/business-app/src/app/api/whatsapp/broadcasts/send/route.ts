import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import {
  getConnection,
  graphRequest,
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';
import { MetaApiError, metaErrorLabel, whatsappFailure } from '@/lib/whatsapp-meta-error';
import { personaliseParameters } from '@/lib/whatsapp-template-params';

export const dynamic = 'force-dynamic';

const BATCH = 10;
const inputSchema = z.object({ broadcastId: z.string().uuid() }).strict();

/**
 * User-initiated, bounded queue tick. The first accepted message must be
 * DELIVERED (webhook receipt) before this endpoint releases further recipients.
 * Meta billing errors open a circuit breaker; there is no retry loop on 131042.
 */
export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return Response.json(
        { message: 'Choose a broadcast.' },
        { status: 400, headers: privateHeaders },
      );

    const { organizationId } = await whatsappContext('automation.manage');
    const database = createOwnerProvisioningDatabase();
    const broadcast = await database
      .from('whatsapp_broadcasts')
      .select('id,connection_id,template_name,language,parameters,status,probe_message_id')
      .eq('organization_id', organizationId)
      .eq('id', input.data.broadcastId)
      .maybeSingle();
    if (broadcast.error || !broadcast.data)
      return Response.json(
        { message: 'Broadcast not found.' },
        { status: 404, headers: privateHeaders },
      );
    if (!['verifying', 'sending'].includes(broadcast.data.status))
      return Response.json(
        { sent: 0, failed: 0, remaining: 0, status: broadcast.data.status },
        { headers: privateHeaders },
      );

    // Claim is atomic and limits 'verifying' campaigns to exactly one probe.
    // It will not claim another probe while the first is in flight/awaiting receipt.
    const claimed = await database.rpc('whatsapp_broadcast_claim', {
      p_organization_id: organizationId,
      p_broadcast_id: broadcast.data.id,
      p_limit: BATCH,
    });
    if (claimed.error) throw new Error('BROADCAST_CLAIM_FAILED');
    const recipients = claimed.data ?? [];
    if (recipients.length === 0) {
      const latest = await database.from('whatsapp_broadcasts')
        .select('status').eq('organization_id', organizationId)
        .eq('id', broadcast.data.id).single();
      return Response.json(
        { sent: 0, failed: 0, remaining: 0,
          status: latest.data?.status ?? broadcast.data.status,
          noProgress: true },
        { headers: privateHeaders },
      );
    }

    const connection = await getConnection(
      organizationId,
      broadcast.data.connection_id,
    );
    const values = Array.isArray(broadcast.data.parameters)
      ? (broadcast.data.parameters as string[])
      : [];
    let sent = 0;
    let failed = 0;
    let halt = false;
    let releaseFrom = recipients.length;

    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index];
      // A delivery-status webhook may have blocked the whole WABA between
      // claims; never continue after that.
      const current = await database.from('whatsapp_broadcasts')
        .select('status').eq('organization_id', organizationId)
        .eq('id', broadcast.data.id).single();
      if (current.error || !['verifying', 'sending'].includes(current.data?.status ?? '')) {
        halt = true;
        releaseFrom = index;
        break;
      }

      const contact = await database
        .from('whatsapp_contacts')
        .select('opted_out_at')
        .eq('organization_id', organizationId)
        .eq('id', recipient.contact_id)
        .maybeSingle();
      if (contact.error) throw new Error('BROADCAST_CONTACT_READ_FAILED');
      if (!contact.data || contact.data.opted_out_at) {
        await database.from('whatsapp_broadcast_recipients')
          .update({ status: 'cancelled', error_code: 'opted_out' })
          .eq('organization_id', organizationId).eq('id', recipient.id)
          .eq('status', 'sending');
        continue;
      }

      const parameters = personaliseParameters(values, recipient.display_name);
      let messageId: string | undefined;
      try {
        const result = await graphRequest<{
          messages?: Array<{ id?: string }>;
        }>(`${connection.phone_number_id}/messages`, connection.accessToken, {
          method: 'POST',
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient.wa_id,
            type: 'template',
            template: {
              name: broadcast.data.template_name,
              language: { code: broadcast.data.language },
              ...(parameters.length
                ? {
                    components: [{
                      type: 'body',
                      parameters: parameters.map((text) => ({ type: 'text', text })),
                    }],
                  }
                : {}),
            },
          }),
        });
        messageId = result.messages?.[0]?.id;
      } catch (error) {
        // A timeout/network failure is ambiguous: Meta might have accepted
        // the message. Never auto-resend that recipient without reconciliation.
        if (!(error instanceof MetaApiError) || error.httpStatus >= 500 || error.code === null) {
          await database.rpc('whatsapp_broadcast_pause', {
            p_organization_id: organizationId,
            p_broadcast_id: broadcast.data.id,
            p_billing: false,
          });
          halt = true;
          releaseFrom = index + 1;
          break;
        }
        const labelled = await database.from('whatsapp_broadcast_recipients')
          .update({ status: 'failed', error_code: metaErrorLabel(error) })
          .eq('organization_id', organizationId).eq('id', recipient.id)
          .eq('status', 'sending');
        if (labelled.error) throw new Error('BROADCAST_FAILURE_SAVE_FAILED');
        failed += 1;

        if (error.code === 131042 || current.data?.status === 'verifying') {
          const paused = await database.rpc('whatsapp_broadcast_pause', {
            p_organization_id: organizationId,
            p_broadcast_id: broadcast.data.id,
            p_billing: error.code === 131042,
          });
          if (paused.error) throw new Error('BROADCAST_BILLING_PAUSE_FAILED');
          halt = true;
          releaseFrom = index + 1;
          break;
        }
        continue;
      }

      if (!messageId) {
        // Missing message ID means acceptance is unknown.
        await database.rpc('whatsapp_broadcast_pause', {
          p_organization_id: organizationId,
          p_broadcast_id: broadcast.data.id,
          p_billing: false,
        });
        halt = true;
        releaseFrom = index + 1;
        break;
      }

      // Record acceptance BEFORE any optional inbox logging: if downstream
      // storage fails, the recipient must not be marked 'failed' and resent.
      const stored = await database.from('whatsapp_broadcast_recipients')
        .update({
          status: 'sent',
          provider_message_id: messageId,
          sent_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId).eq('id', recipient.id)
        .eq('status', 'sending')
        .select('id').maybeSingle();
      if (stored.error || !stored.data)
        throw new Error('BROADCAST_ACCEPTED_MESSAGE_SAVE_FAILED');

      if (current.data?.status === 'verifying') {
        const updated = await database.from('whatsapp_broadcasts')
          .update({ probe_message_id: messageId })
          .eq('organization_id', organizationId).eq('id', broadcast.data.id)
          .eq('status', 'verifying')
          .is('probe_message_id', null);
        if (updated.error) throw new Error('BROADCAST_PROBE_SAVE_FAILED');
      }

      const log = await database.rpc('whatsapp_message_log_outbound', {
        p_organization_id: organizationId,
        p_connection_id: connection.id,
        p_to: recipient.wa_id,
        p_provider_id: messageId,
        p_body: `Broadcast · ${broadcast.data.template_name}`,
        p_type: 'template',
      });
      if (log.error) throw new Error('BROADCAST_OUTBOUND_LOG_FAILED');
      sent += 1;
    }

    // Only untouched claims return to the queue. An ambiguous network or
    // storage failure stays 'sending' for manual reconciliation, never auto-resend.
    if (halt && releaseFrom < recipients.length) {
      const untouched = recipients.slice(releaseFrom).map((r) => r.id);
      const released = await database.from('whatsapp_broadcast_recipients')
        .update({ status: 'queued' })
        .eq('organization_id', organizationId)
        .eq('broadcast_id', broadcast.data.id)
        .in('id', untouched)
        .eq('status', 'sending');
      if (released.error) throw new Error('BROADCAST_UNTOUCHED_RELEASE_FAILED');
    }

    const remaining = await database
      .from('whatsapp_broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('broadcast_id', broadcast.data.id)
      .in('status', ['queued', 'sending']);
    if (remaining.error) throw new Error('BROADCAST_PROGRESS_READ_FAILED');
    const left = remaining.count ?? 0;

    if (left === 0)
      await database.from('whatsapp_broadcasts')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('organization_id', organizationId).eq('id', broadcast.data.id)
        .eq('status', 'sending');

    const latest = await database.from('whatsapp_broadcasts')
      .select('status').eq('organization_id', organizationId)
      .eq('id', broadcast.data.id).single();
    if (latest.error) throw new Error('BROADCAST_PROGRESS_READ_FAILED');
    return Response.json(
      { sent, failed, remaining: left, status: latest.data.status },
      { headers: privateHeaders },
    );
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status: failure.status,
      headers: privateHeaders,
    });
  }
}
