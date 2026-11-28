import { createHmac, timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import {
  ensureMetaLeadForm,
  metaLeadConfig,
  processMetaLead,
} from '@/lib/meta-leads';

export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'no-store',
  'X-Business-OS-Webhook': 'meta-leads-v2',
};

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Meta's one-time check when the Page webhook is registered. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = metaLeadConfig().verifyToken;
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  if (
    url.searchParams.get('hub.mode') !== 'subscribe' ||
    expected.length < 16 ||
    !equalSecret(url.searchParams.get('hub.verify_token') ?? '', expected) ||
    !challenge
  )
    return new Response('Forbidden', { status: 403, headers });
  return new Response(challenge.slice(0, 200), { status: 200, headers });
}

/**
 * Meta pushes a `leadgen` change the moment someone submits a lead form.
 * The signed envelope is acknowledged immediately, then each lead is fetched
 * and imported once after the response so Meta never times out on automation.
 */
export async function POST(request: Request) {
  const secret = metaLeadConfig().appSecret;
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
    entry?: Array<{
      id?: unknown;
      changes?: Array<{
        field?: string;
        value?: { leadgen_id?: unknown; form_id?: unknown };
      }>;
    }>;
  };
  try {
    body = JSON.parse(raw.toString('utf8')) as typeof body;
  } catch {
    return new Response('Invalid payload', { status: 400, headers });
  }
  if (body.object !== 'page' || !Array.isArray(body.entry))
    return Response.json({ received: true }, { status: 200, headers });

  const deliveries: Array<{
    pageId: string;
    leadgenId: string;
    formId: string;
  }> = [];
  for (const entry of body.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'leadgen') continue;
      deliveries.push({
        pageId: String(entry?.id ?? ''),
        leadgenId: String(change.value?.leadgen_id ?? ''),
        formId: String(change.value?.form_id ?? ''),
      });
    }
  }

  // Meta treats a webhook as rejected when acknowledgement takes too long.
  // Verify and acknowledge the signed envelope immediately, then finish the
  // Graph fetch, CRM import and optional WhatsApp automation after the response.
  after(async () => {
    for (const { pageId, leadgenId, formId } of deliveries) {
      try {
        // Provision a newly-created form on first delivery. This keeps the
        // Page subscription working for future forms without requiring the
        // owner to reconnect every form manually.
        await ensureMetaLeadForm({ pageId, formId });
        await processMetaLead({
          leadgenId,
          formId,
          notify: true,
        });
      } catch (error) {
        console.error('Meta lead processing failed after acknowledgement', {
          pageId,
          formId,
          leadgenId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });
  return Response.json(
    { received: true, deliveries: deliveries.length },
    { status: 200, headers },
  );
}
