import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import { paymentReceiptPdf } from '../../../../payment-receipt-pdf';
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
  const result = await db.rpc('client_payment_proof_receipt', {
    p_project: project,
    p_proof: id,
  });
  if (result.error || !result.data)
    return new Response('Not found', { status: 404 });
  try {
    const bytes = await paymentReceiptPdf(result.data);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="payment-receipt.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Receipt temporarily unavailable', { status: 503 });
  }
}
