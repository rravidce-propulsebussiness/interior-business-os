import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import { getPaymentProof } from '../../../../payment-proof-storage';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = new URL(request.url).searchParams.get('project') ?? '';
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(project).success)
    return new Response('Not found', { status: 404 });
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response('Unauthorized', { status: 401 });
  const result = await db.rpc('client_payment_proof_media', {
    p_project: project,
    p_proof: id,
  });
  if (result.error || !result.data)
    return new Response('Not found', { status: 404 });
  const details = result.data as { key: string; mime: string };
  try {
    const bytes = await getPaymentProof(details.key);
    if (!bytes) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': details.mime,
        'Content-Disposition':
          details.mime === 'application/pdf' ? 'attachment' : 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response('Evidence unavailable', { status: 503 });
  }
}
