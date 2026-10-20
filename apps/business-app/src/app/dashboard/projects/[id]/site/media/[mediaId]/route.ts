import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { r2MediaEnabled, r2MediaGet } from '../../r2-media';

export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(mediaId).success)
    return new Response('Not found', { status: 404 });
  try {
    const s = await serverServices();
    await s.authorization.requireAuthenticatedUser();
    const context = await activeOrganization();
    if (!context) return new Response('Not found', { status: 404 });
    // The R2 locator RPC repeats the existing project/role media check.
    const locator = await s.client.rpc(
      'project_site_media_r2_key' as never,
      {
        p_organization_id: context.organizationId,
        p_project_id: id,
        p_id: mediaId,
      } as never,
    );
    if (locator.error) return new Response('Not found', { status: 404 });
    const r2Key: unknown = locator.data;
    if (typeof r2Key === 'string' && r2Key) {
      if (!r2MediaEnabled())
        return new Response('Media temporarily unavailable', { status: 503 });
      try {
        const bytes = await r2MediaGet(r2Key);
        if (!bytes) return new Response('Media temporarily unavailable', { status: 503 });
        const meta = await s.client.rpc('project_site_media_get', {
          p_organization_id: context.organizationId,
          p_project_id: id,
          p_id: mediaId,
        });
        const data = meta.data as Record<string, unknown> | null;
        if (meta.error || !data || typeof data.mime !== 'string' || typeof data.filename !== 'string')
          return new Response('Not found', { status: 404 });
        return new Response(new Uint8Array(bytes), {
          headers: {
            'Content-Type': data.mime,
            'Content-Disposition':
              (data.mime === 'application/pdf' ? 'attachment' : 'inline') +
              "; filename*=UTF-8''" + encodeURIComponent(data.filename),
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
          },
        });
      } catch {
        return new Response('Media temporarily unavailable', {
          status: 503,
          headers: { 'Cache-Control': 'private, no-store' },
        });
      }
    }
    const { data, error } = await s.client.rpc('project_site_media_get', {
      p_organization_id: context.organizationId,
      p_project_id: id,
      p_id: mediaId,
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data))
      return new Response('Not found', { status: 404 });
    const file = data as Record<string, unknown>;
    if (
      typeof file.base64 !== 'string' ||
      typeof file.filename !== 'string' ||
      typeof file.mime !== 'string'
    )
      return new Response('Not found', { status: 404 });
    if (
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'application/pdf',
      ].includes(file.mime)
    )
      return new Response('Not found', { status: 404 });
    const bytes = Buffer.from(file.base64, 'base64');
    if (bytes.length < 1 || bytes.length > 8388608)
      return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition':
          (file.mime === 'application/pdf' ? 'attachment' : 'inline') +
          "; filename*=UTF-8''" +
          encodeURIComponent(file.filename),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
