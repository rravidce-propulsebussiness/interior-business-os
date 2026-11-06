import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import type { Json } from '@business-os/database';
import { getConnection, graphRequest } from '@/lib/whatsapp-cloud';
import { metaErrorLabel } from '@/lib/whatsapp-meta-error';
import { routeWebhookChange } from '@/lib/whatsapp-webhook-routing';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode') ?? '';
  const token = url.searchParams.get('hub.verify_token') ?? '';
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '';
  if (
    mode !== 'subscribe' ||
    !expected ||
    !equalSecret(token, expected) ||
    !challenge
  )
    return new Response('Forbidden', { status: 403, headers });
  return new Response(challenge, { status: 200, headers });
}

export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET ?? '';
  if (!secret) return new Response('Unavailable', { status: 503, headers });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length === 0 || raw.length > 1_000_000)
    return new Response('Invalid payload', { status: 400, headers });
  const signature = request.headers.get('x-hub-signature-256') ?? '';
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  if (!equalSecret(signature, expected))
    return new Response('Forbidden', { status: 403, headers });

  let body: {
    object?: string;
    entry?: Array<{ id?: string; changes?: unknown[] }>;
  };
  try {
    body = JSON.parse(raw.toString('utf8')) as typeof body;
  } catch {
    return new Response('Invalid payload', { status: 400, headers });
  }
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry))
    return Response.json({ received: true }, { status: 200, headers });

  try {
    const database = createOwnerProvisioningDatabase();
    for (const entry of body.entry) {
      const wabaId = entry.id ?? '';
      if (!/^[0-9]{5,32}$/.test(wabaId) || !Array.isArray(entry.changes))
        continue;
      // Disconnected rows are excluded. A database failure returns 503 so Meta retries.
      const { data: connections, error } = await database
        .from('whatsapp_business_connections')
        .select('id,organization_id,phone_number_id')
        .eq('waba_id', wabaId)
        .eq('status', 'connected');
      if (error) throw new Error('WEBHOOK_CONNECTION_LOOKUP_FAILED');

      for (const change of entry.changes) {
        const route = routeWebhookChange(connections ?? [], change);
        if (route.kind === 'ignore') continue;
        if (route.kind === 'account') {
          for (const organizationId of route.organizationIds) {
            const accountPayload = { waba_id: wabaId, change };
            const stored = await database.from('whatsapp_webhook_events').upsert(
              {
                organization_id: organizationId,
                waba_id: wabaId,
                idempotency_key: createHash('sha256')
                  .update(JSON.stringify({ ...accountPayload, organizationId }))
                  .digest('hex'),
                payload: accountPayload as Json,
              },
              { onConflict: 'idempotency_key', ignoreDuplicates: true },
            );
            if (stored.error) throw new Error('WEBHOOK_QUEUE_FAILED');
          }
          continue;
        }
        const { connection } = route;
        const payload = { waba_id: wabaId, change };
        const idempotencyKey = createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex');
        const saved = await database.from('whatsapp_webhook_events').upsert(
          {
            organization_id: connection.organization_id,
            waba_id: wabaId,
            idempotency_key: idempotencyKey,
            payload: payload as Json,
          },
          { onConflict: 'idempotency_key', ignoreDuplicates: true },
        );
        if (saved.error) throw new Error('WEBHOOK_QUEUE_FAILED');

        const ingested = await database.rpc('whatsapp_message_ingest', {
          p_organization_id: connection.organization_id,
          p_connection_id: connection.id,
          p_change: change as Json,
        });
        if (ingested.error) throw new Error('WHATSAPP_MESSAGE_INGEST_FAILED');

        const value = (change as { value?: Record<string, unknown> })?.value;
        const messages = Array.isArray(value?.messages)
          ? (value.messages as Array<Record<string, unknown>>)
          : [];
        for (const message of messages) {
          const waId = String(message.from ?? '');
          const messageId = String(message.id ?? '');
          const messageText = String(
            (message.text as Record<string, unknown> | undefined)?.body ?? '',
          );
          if (!/^\d{5,32}$/.test(waId) || !messageId) continue;
          const normalized = messageText.trim().toUpperCase();
          if (
            [
              'STOP',
              'STOPALL',
              'UNSUBSCRIBE',
              'CANCEL',
              'END',
              'QUIT',
            ].includes(normalized)
          ) {
            await database.rpc('whatsapp_contact_state', {
              p_organization_id: connection.organization_id,
              p_connection_id: connection.id,
              p_wa_id: waId,
              p_action: 'opt_out',
            });
            continue;
          }
          if (normalized === 'START') {
            await database.rpc('whatsapp_contact_state', {
              p_organization_id: connection.organization_id,
              p_connection_id: connection.id,
              p_wa_id: waId,
              p_action: 'opt_in',
            });
            continue;
          }
          if (String(message.type ?? '') !== 'text' || !messageText.trim())
            continue;
          const match = await database.rpc('whatsapp_automation_match', {
            p_organization_id: connection.organization_id,
            p_connection_id: connection.id,
            p_message_id: messageId,
            p_wa_id: waId,
            p_text: messageText.slice(0, 4000),
          });
          if (match.error || !match.data) continue;
          const rule = match.data as {
            run_id?: string;
            reply_text?: string;
            to?: string;
            name?: string;
          };
          if (!rule.run_id || !rule.reply_text || !rule.to) continue;
          const replyText = rule.reply_text.replace(
            /\{\{name\}\}/gi,
            rule.name?.trim() || rule.to,
          );
          try {
            const connected = await getConnection(
              connection.organization_id,
              connection.id,
            );
            const result = await graphRequest<{
              messages?: Array<{ id?: string }>;
            }>(`${connected.phone_number_id}/messages`, connected.accessToken, {
              method: 'POST',
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: rule.to,
                type: 'text',
                text: { preview_url: false, body: replyText },
              }),
            });
            const providerId = result.messages?.[0]?.id ?? '';
            if (!providerId) throw new Error('META_MESSAGE_ID_MISSING');
            await database.rpc('whatsapp_message_log_outbound', {
              p_organization_id: connection.organization_id,
              p_connection_id: connection.id,
              p_to: rule.to,
              p_provider_id: providerId,
              p_body: replyText,
              p_type: 'text',
            });
            await database.rpc('whatsapp_automation_finish', {
              p_organization_id: connection.organization_id,
              p_run_id: rule.run_id,
              p_status: 'sent',
              p_provider_id: providerId,
            });
          } catch (sendError) {
            await database.rpc('whatsapp_automation_finish', {
              p_organization_id: connection.organization_id,
              p_run_id: rule.run_id,
              p_status: 'failed',
              p_error: metaErrorLabel(sendError),
            });
          }
        }
      }
    }
    return Response.json({ received: true }, { status: 200, headers });
  } catch {
    return new Response('Unavailable', { status: 503, headers });
  }
}
