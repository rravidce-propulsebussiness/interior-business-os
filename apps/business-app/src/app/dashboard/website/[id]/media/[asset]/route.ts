import { websiteServices } from '../../../service';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; asset: string }> },
) {
  try {
    const { id, asset } = await params;
    const s = await websiteServices('website.media.manage');
    await s.website.read(id);
    const r = await s.client.rpc('website_asset_read', {
      p_organization_id: s.context.organizationId,
      p_asset_id: asset,
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
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition':
          a.mime === 'application/pdf' ? 'attachment' : 'inline',
      },
    });
  } catch {
    return new Response('Unavailable', {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
