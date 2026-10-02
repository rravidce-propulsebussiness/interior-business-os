import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { websiteJson } from '@business-os/database/website';
import { currentWebsite, normalizeHostname } from '../../../website';
import { escapeHtml } from '@business-os/website-builder/compiler';
export async function POST(request: Request) {
  const host = normalizeHostname(request.headers.get('host'));
  const json = request.headers
    .get('content-type')
    ?.includes('application/json');
  const reply = (message: string, status: number) =>
    json
      ? Response.json(
          { message },
          { status, headers: { 'Cache-Control': 'no-store' } },
        )
      : new Response(
          `<!doctype html><html><head><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enquiry</title></head><body><main style="font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>${status === 200 ? 'Thank you' : 'Enquiry not sent'}</h1><p>${escapeHtml(message)}</p><a href="/">Return to website</a></main></body></html>`,
          {
            status,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'Content-Security-Policy':
                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
            },
          },
        );
  if (!host || !isSupabaseConfigured()) return reply('Form unavailable', 404);
  const origin = request.headers.get('origin');
  try {
    if (origin && normalizeHostname(new URL(origin).host) !== host)
      return reply('Form unavailable', 403);
  } catch {
    return reply('Form unavailable', 403);
  }
  if (Number(request.headers.get('content-length') ?? 0) > 20000)
    return reply('Enquiry is too large', 413);
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 20000) {
          await reader.cancel();
          return reply('Enquiry is too large', 413);
        }
        chunks.push(value);
      }
    const text = Buffer.concat(chunks).toString('utf8');
    if (Buffer.byteLength(text) > 20000)
      return reply('Enquiry is too large', 413);
    const site = await currentWebsite();
    if (!site?.formsEnabled) return reply('Form unavailable', 404);
    let fields: Record<string, unknown>;
    if (json) {
      const body = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return reply('Check the form fields', 400);
      fields = body;
    } else fields = Object.fromEntries(new URLSearchParams(text));
    const formId = String(fields._form ?? ''),
      page = String(fields._page ?? '');
    const form = site.build.document.forms.find(
      (f) => f.id === formId && f.enabled,
    );
    if (!form) return reply('Form unavailable', 404);
    const values: Record<string, unknown> = {};
    for (const f of form.fields) {
      if (f.type === 'hidden') continue;
      if (fields[f.key] !== undefined)
        values[f.key] = ['consent', 'checkbox'].includes(f.type)
          ? fields[f.key] === true || fields[f.key] === 'true'
          : fields[f.key];
    }
    const result = await createPublicDatabase().rpc('website_submit_lead', {
      p_hostname: host,
      p_page: page,
      p_form: formId,
      p_values: websiteJson(values),
      p_honeypot: String(fields._company ?? ''),
      p_attribution: {},
    });
    const r = result.data;
    if (result.error || !r || typeof r !== 'object' || Array.isArray(r))
      return reply('Check your details and consent, then try again.', 400);
    return reply(String(r.message), r.accepted === true ? 200 : 429);
  } catch {
    return reply('Check your details and try again.', 400);
  }
}
