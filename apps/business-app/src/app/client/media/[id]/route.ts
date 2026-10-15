import { createServerDatabase } from '@business-os/database/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const fileSchema = z.object({
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  filename: z.string(),
  base64: z.string(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response('Not found', { status: 404 });
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response('Unauthorized', { status: 401 });
  const rpc = db.rpc.bind(db) as unknown as (
    name: string,
    args: Record<string, string>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const result = await rpc('client_portal_media_get', { p_media_id: id });
  const parsed = fileSchema.safeParse(result.data);
  if (result.error || !parsed.success)
    return new Response('Not found', { status: 404 });
  const body = new Uint8Array(Buffer.from(parsed.data.base64, 'base64'));
  const disposition =
    parsed.data.mime === 'application/pdf' ? 'attachment' : 'inline';
  return new Response(body, {
    headers: {
      'Content-Type': parsed.data.mime,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
