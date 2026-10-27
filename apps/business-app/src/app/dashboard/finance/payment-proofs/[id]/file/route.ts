import { z } from 'zod';
import { financeServices } from '../../../service';
import { getPaymentProof } from '../../../../../payment-proof-storage';
export const runtime = 'nodejs';
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response('Not found', { status: 404 });
  try {
    const s = await financeServices('payment.record', true);
    const result = await s.client.rpc('staff_payment_proof_media', {
      p_org: s.org,
      p_proof: id,
    });
    if (result.error || !result.data)
      return new Response('Not found', { status: 404 });
    const detail = result.data as { key: string; mime: string };
    const bytes = await getPaymentProof(detail.key);
    if (!bytes) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': detail.mime,
        'Content-Disposition':
          detail.mime === 'application/pdf' ? 'attachment' : 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response('Evidence unavailable', { status: 503 });
  }
}
