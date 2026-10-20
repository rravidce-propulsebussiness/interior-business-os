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

    // Existing Supabase RPC is the authoritative per-organization,
    // project, role and agreement permission check.
    const info = await s.client.rpc('project_site_media_get', {
      p_organization_id: context.organizationId,
      p_project_id: id,
      p_id: mediaId,
    });
    if (info.error || !info.data || typeof info.data !== 'object' ||
        Array.isArray(info.data))
      return new Response('Not found', { status: 404 });
    const file = info.data as Record<string, unknown>;
    if (typeof file.filename !== 'string' || typeof file.mime !== 'string' ||
        typeof file.base64 !== 'string')
      return new Response('Not found', { status: 404 });
    if (![
      'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf',
    ].includes(file.mime))
      return new Response('Not found', { status: 404 });

    const locator = await s.client.rpc(
      'project_site_media_r2_key' as never,
      { p_organization_id: context.organizationId,
        p_project_id: id, p_id: mediaId } as never,
    );
    if (locator.error) return new Response('Not found', { status: 404 });

    // During backfill old bytes are deliberately retained. If R2 is not yet
    // configured (or temporarily unavailable), those files stay accessible.
    // New R2-native uploads have no bytea fallback, so fail closed with 503.
    let bytes = Buffer.from(file.base64, 'base64');
    const key: unknown = locator.data;
    if (typeof key === 'string' && key) {
      if (r2MediaEnabled()) {
        try {
          const remote = await r2MediaGet(key);
          if (remote) bytes = remote;
        } catch {
          if (!bytes.length)
            return new Response('Media temporarily unavailable', { status: 503 });
        }
      }
      if (!bytes.length)
        return new Response('Media temporarily unavailable', { status: 503 });
    }
    if (!bytes.length || bytes.length > 8388608)
      return new Response('Not found', { status: 404 });

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition':
          (file.mime === 'application/pdf' ? 'attachment' : 'inline') +
          "; filename*=UTF-8''" + encodeURIComponent(file.filename),
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
