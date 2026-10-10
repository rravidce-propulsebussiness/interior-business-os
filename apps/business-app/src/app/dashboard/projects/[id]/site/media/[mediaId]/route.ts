import { z } from 'zod';
import {
  activeOrganization,
  serverServices,
} from '@business-os/auth/server';

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
    const { data, error } = await s.client.rpc('project_site_media_get', {
      p_organization_id: context.organizationId,
      p_project_id: id,
      p_id: mediaId,
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data))
      return new Response('Not found', { status: 404 });
    const file = data as Record<string, unknown>;
    if (typeof file.base64 !== 'string' ||
        typeof file.filename !== 'string' ||
        typeof file.mime !== 'string')
      return new Response('Not found', { status: 404 });
    if (!['image/jpeg','image/png','image/webp','video/mp4','application/pdf'].includes(file.mime))
      return new Response('Not found', { status: 404 });
    const bytes = Buffer.from(file.base64, 'base64');
    if (bytes.length < 1 || bytes.length > 8388608)
      return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': (file.mime === 'application/pdf' ? 'attachment' : 'inline') +
          "; filename*=UTF-8''" + encodeURIComponent(file.filename),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
