import { DomainError } from '@business-os/shared';
import {
  getConnection,
  graphRequest,
  privateHeaders,
  validSameOrigin,
  whatsappContext,
} from '@/lib/whatsapp-cloud';
import { whatsappFailure } from '@/lib/whatsapp-meta-error';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
const MIME_TYPES: Record<string, 'image' | 'video' | 'audio' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/3gpp': 'video',
  'audio/aac': 'audio',
  'audio/mp4': 'audio',
  'audio/mpeg': 'audio',
  'audio/amr': 'audio',
  'audio/ogg': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
};

export async function POST(request: Request) {
  try {
    if (!validSameOrigin(request))
      return Response.json(
        { message: 'Request origin was not accepted.' },
        { status: 403, headers: privateHeaders },
      );
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024)
      return Response.json(
        { message: 'Attachments are limited to 16 MB.' },
        { status: 413, headers: privateHeaders },
      );
    const form = await request.formData();
    const file = form.get('file');
    const connectionId = String(form.get('connectionId') ?? '');
    if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(connectionId))
      return Response.json(
        { message: 'Choose a valid file and WhatsApp number.' },
        { status: 400, headers: privateHeaders },
      );
    if (!file.size || file.size > MAX_UPLOAD_BYTES)
      return Response.json(
        { message: 'Choose a file smaller than 16 MB.' },
        { status: 413, headers: privateHeaders },
      );
    const mediaType = MIME_TYPES[file.type];
    if (!mediaType)
      return Response.json(
        { message: 'This file type is not supported by WhatsApp.' },
        { status: 415, headers: privateHeaders },
      );

    const { organizationId } = await whatsappContext('automation.manage');
    const connection = await getConnection(organizationId, connectionId);
    const version = process.env.META_GRAPH_API_VERSION ?? '';
    if (!/^v\d+\.0$/.test(version))
      throw new Error('META_API_UNAVAILABLE');

    const upload = new FormData();
    upload.append('messaging_product', 'whatsapp');
    upload.append('type', file.type);
    const fileName = file.name
      .replaceAll(String.fromCharCode(92), '_')
      .replaceAll('/', '_')
      .replaceAll(String.fromCharCode(13), '_')
      .replaceAll(String.fromCharCode(10), '_')
      .replaceAll('"', '_')
      .slice(0, 120) || 'attachment';
    upload.append('file', file, fileName);
    const response = await fetch(
      `https://graph.facebook.com/${version}/${connection.phone_number_id}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${connection.accessToken}` },
        body: upload,
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = (await response.json().catch(() => null)) as
      | { id?: string; error?: unknown }
      | null;
    if (!response.ok || !data?.id) {
      const failure = whatsappFailure(data?.error ?? new Error('MEDIA_UPLOAD_FAILED'));
      return Response.json(failure.body, {
        status: failure.status,
        headers: privateHeaders,
      });
    }
    return Response.json(
      { mediaId: data.id, mediaType, fileName },
      { headers: privateHeaders },
    );
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status:
        error instanceof DomainError && error.code === 'UNAUTHENTICATED'
          ? 401
          : failure.status,
      headers: privateHeaders,
    });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const connectionId = url.searchParams.get('connectionId') ?? '';
    const mediaId = url.searchParams.get('mediaId') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(connectionId) || !/^[A-Za-z0-9._-]{1,200}$/.test(mediaId))
      return new Response('Not found', { status: 404, headers: privateHeaders });

    const { organizationId } = await whatsappContext('automation.view');
    const connection = await getConnection(organizationId, connectionId);
    const media = await graphRequest<{ url?: string; mime_type?: string }>(
      mediaId,
      connection.accessToken,
    );
    if (!media.url || !media.mime_type)
      return new Response('Media unavailable', { status: 404, headers: privateHeaders });
    const mediaUrl = new URL(media.url);
    if (
      mediaUrl.protocol !== 'https:' ||
      (mediaUrl.hostname !== 'lookaside.fbsbx.com' &&
        !mediaUrl.hostname.endsWith('.fbcdn.net'))
    )
      return new Response('Media unavailable', { status: 502, headers: privateHeaders });

    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${connection.accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || !response.body)
      return new Response('Media unavailable', { status: 502, headers: privateHeaders });

    const headers = new Headers(privateHeaders);
    headers.set('Content-Type', media.mime_type);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set(
      'Content-Disposition',
      media.mime_type.startsWith('image/') ||
        media.mime_type.startsWith('video/') ||
        media.mime_type.startsWith('audio/')
        ? 'inline'
        : 'attachment; filename="whatsapp-attachment"',
    );
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    const failure = whatsappFailure(error);
    return Response.json(failure.body, {
      status:
        error instanceof DomainError && error.code === 'UNAUTHENTICATED'
          ? 401
          : failure.status,
      headers: privateHeaders,
    });
  }
}
