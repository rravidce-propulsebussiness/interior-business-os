import { brochureServices } from '../../../service';
import { brochureResult, jsonObject } from '@business-os/database/brochure';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; asset: string }> },
) {
  try {
    const { id, asset } = await params;
    const s = await brochureServices();
    const version = new URL(request.url).searchParams.get('version');
    const r = jsonObject(
      brochureResult(
        await s.client.rpc('brochure_asset_read', {
          p_organization_id: s.context.organizationId,
          p_brochure_id: id,
          p_asset_id: asset,
          ...(version ? { p_version_id: version } : {}),
        }),
      ),
    );
    return new Response(new Uint8Array(Buffer.from(String(r.data), 'base64')), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
