import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import {
  getConnection,
  graphRequest,
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';
import { metaErrorLabel, whatsappFailure } from '@/lib/whatsapp-meta-error';
import { personaliseParameters } from '@/lib/whatsapp-template-params';

export const dynamic = 'force-dynamic';

const BATCH = 20;
const inputSchema = z.object({ broadcastId: z.string().uuid() }).strict();

/**
 * Sends the next batch of a broadcast. The Broadcasts screen calls this in a
 * loop and shows progress; recipients are claimed atomically so a second tab
 * cannot send the same message twice.
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
      .select('id,connection_id,template_name,language,parameters,status')
      .eq('organization_id', organizationId)
      .eq('id', input.data.broadcastId)
      .maybeSingle();
    if (broadcast.error || !broadcast.data)
      return Response.json(
        { message: 'Broadcast not found.' },
        { status: 404, headers: privateHeaders },
      );
    if (broadcast.data.status !== 'sending')
      return Response.json(
        { sent: 0, failed: 0, remaining: 0, status: broadcast.data.status },
        { headers: privateHeaders },
      );
    const connection = await getConnection(
      organizationId,
      broadcast.data.connection_id,
    );
    const claimed = await database.rpc('whatsapp_broadcast_claim', {
      p_organization_id: organizationId,
      p_broadcast_id: broadcast.data.id,
      p_limit: BATCH,
    });
    if (claimed.error) throw new Error('BROADCAST_CLAIM_FAILED');
    const values = Array.isArray(broadcast.data.parameters)
      ? (broadcast.data.parameters as string[])
      : [];
    let sent = 0;
    let failed = 0;
    for (const recipient of claimed.data ?? []) {
      // Respect an opt-out that arrived after the broadcast was created.
      const contact = await database
        .from('whatsapp_contacts')
        .select('opted_out_at')
        .eq('organization_id', organizationId)
        .eq('id', recipient.contact_id)
        .maybeSingle();
      if (contact.data?.opted_out_at) {
        await database
          .from('whatsapp_broadcast_recipients')
          .update({ status: 'cancelled', error_code: 'opted_out' })
          .eq('id', recipient.id);
        continue;
      }
      try {
        const parameters = personaliseParameters(
          values,
          recipient.display_name,
        );
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
                    components: [
                      {
                        type: 'body',
                        parameters: parameters.map((text) => ({
                          type: 'text',
                          text,
                        })),
                      },
                    ],
                  }
                : {}),
            },
          }),
        });
        const messageId = result.messages?.[0]?.id;
        if (!messageId) throw new Error('META_MESSAGE_ID_MISSING');
        await database.rpc('whatsapp_message_log_outbound', {
          p_organization_id: organizationId,
          p_connection_id: connection.id,
          p_to: recipient.wa_id,
          p_provider_id: messageId,
          p_body: `Broadcast · ${broadcast.data.template_name}`,
          p_type: 'template',
        });
        await database
          .from('whatsapp_broadcast_recipients')
          .update({
            status: 'sent',
            provider_message_id: messageId,
            sent_at: new Date().toISOString(),
          })
          .eq('id', recipient.id);
        sent += 1;
      } catch (error) {
        await database
          .from('whatsapp_broadcast_recipients')
          .update({ status: 'failed', error_code: metaErrorLabel(error) })
          .eq('id', recipient.id);
        failed += 1;
      }
    }
    const remaining = await database
      .from('whatsapp_broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('broadcast_id', broadcast.data.id)
      .in('status', ['queued', 'sending']);
    const left = remaining.count ?? 0;
    if (left === 0)
      await database
        .from('whatsapp_broadcasts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', broadcast.data.id)
        .eq('status', 'sending');
    return Response.json(
      { sent, failed, remaining: left, status: left ? 'sending' : 'completed' },
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
