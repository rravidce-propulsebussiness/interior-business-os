import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import type { Json } from '@business-os/database';

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
  if (mode !== 'subscribe' || !expected || !equalSecret(token, expected) || !challenge)
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
  if (!equalSecret(signature, expected)) return new Response('Forbidden', { status: 403, headers });

  let body: { object?: string; entry?: Array<{ id?: string; changes?: unknown[] }> };
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
      if (!/^[0-9]{5,32}$/.test(wabaId) || !Array.isArray(entry.changes)) continue;
      const { data: connection, error } = await database
        .from('whatsapp_business_connections')
        .select('organization_id')
        .eq('waba_id', wabaId)
        .maybeSingle();
      if (error || !connection) continue;

      for (const change of entry.changes) {
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
      }
    }
    return Response.json({ received: true }, { status: 200, headers });
  } catch {
    return new Response('Unavailable', { status: 503, headers });
  }
}
