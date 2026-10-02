import {
  createPublicDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';
import { normalizeHostname } from '../../../website';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const host = normalizeHostname(request.headers.get('host'));
  if (!host || !isSupabaseConfigured() || !/^[0-9a-f-]{36}$/.test(id))
    return new Response('Not found', { status: 404 });
  const r = await createPublicDatabase().rpc('website_asset_public', {
    p_hostname: host,
    p_asset_id: id,
  });
  const a = r.data;
  if (
    r.error ||
    !a ||
    typeof a !== 'object' ||
    Array.isArray(a) ||
    typeof a.data !== 'string'
  )
    return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(a.data, 'base64'), {
    headers: {
      'Content-Type': String(a.mime),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition':
        a.mime === 'application/pdf' ? 'attachment' : 'inline',
    },
  });
}
