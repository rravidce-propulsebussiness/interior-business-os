import 'server-only';
import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import {
  publicQuotationSchema,
  shareTokenSchema,
  customerResponseSchema,
} from '@business-os/core/quotation-sharing';
import { DomainError } from '@business-os/shared';
export const publicHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
async function call(
  token: string,
  operation: 'view' | 'pdf' | 'respond',
  input: Record<string, string | boolean> = {},
) {
  if (!isSupabaseConfigured()) throw new DomainError('NOT_FOUND');
  const parsed = shareTokenSchema.safeParse(token);
  if (!parsed.success) throw new DomainError('NOT_FOUND');
  const { data, error } = await createPublicDatabase().rpc('public_quotation', {
    p_token: parsed.data,
    p_operation: operation,
    p_input: input,
  });
  if (error || !data)
    throw new DomainError(
      error?.code === '40001'
        ? 'CONFLICT'
        : error?.code === '22023'
          ? 'VALIDATION_FAILED'
          : 'NOT_FOUND',
    );
  return data;
}
export async function publicQuotation(
  token: string,
  operation: 'view' | 'pdf' = 'view',
) {
  return publicQuotationSchema.parse(await call(token, operation));
}
export async function publicResponse(token: string, input: unknown) {
  return call(token, 'respond', customerResponseSchema.parse(input));
}
export function unavailable() {
  return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quotation unavailable</title><main><h1>Quotation unavailable</h1><p>This link may have expired or been revoked. Contact the business for a current quotation.</p></main></html>',
    {
      status: 404,
      headers: { ...publicHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}
