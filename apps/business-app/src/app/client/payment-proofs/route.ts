import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import {
  savePaymentProof,
  deletePaymentProof,
  proofKey,
} from '../../payment-proof-storage';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
const inputSchema = z.object({
  project: z.uuid(),
  request: z.uuid(),
  amount: z.coerce.number().finite().positive().max(1000000000),
  reference: z
    .string()
    .trim()
    .min(6)
    .max(110)
    .regex(/^[A-Za-z0-9 _./:-]+$/),
  method: z.enum(['upi', 'bank_transfer', 'cheque', 'cash', 'other']),
});
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) {
    const allowedHosts = [
      new URL(request.url).host,
      request.headers.get('host'),
      request.headers.get('x-forwarded-host'),
    ];
    if (!allowedHosts.includes(new URL(origin).host))
      return Response.json({ message: 'Invalid origin' }, { status: 403 });
  }
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user)
    return Response.json(
      { message: 'Sign in to your client portal' },
      { status: 401 },
    );
  let key: string | undefined;
  try {
    const form = await request.formData();
    const parsed = inputSchema.safeParse({
      project: form.get('project'),
      request: form.get('request'),
      amount: form.get('amount'),
      reference: form.get('reference'),
      method: form.get('method'),
    });
    if (!parsed.success)
      return Response.json(
        { message: 'Check the payment details' },
        { status: 400 },
      );
    const proof = form.get('proof');
    if (
      !(proof instanceof File) ||
      proof.size < 1 ||
      proof.size > 5 * 1024 * 1024
    )
      return Response.json(
        { message: 'Upload a screenshot or PDF up to 5 MB' },
        { status: 400 },
      );
    const details = parsed.data;
    // Preflight authorizes this exact signed-in customer and project BEFORE
    // uploading bytes; the final DB submit repeats authorization atomically.
    const preflight = await db.rpc('client_payment_proof_prepare', {
      p_project: details.project,
      p_request: details.request,
      p_amount: details.amount,
      p_reference: details.reference,
    });
    if (preflight.error || !preflight.data)
      return Response.json(
        { message: 'Payment request unavailable or amount invalid' },
        { status: 403 },
      );
    const permitted = preflight.data as { organization_id?: string };
    if (!z.uuid().safeParse(permitted.organization_id).success)
      return Response.json(
        { message: 'Project verification failed' },
        { status: 403 },
      );
    const id = randomUUID();
    key = proofKey(permitted.organization_id!, details.project, id);
    const bytes = Buffer.from(await proof.arrayBuffer());
    await savePaymentProof(key, bytes, proof.type);
    const submitted = await db.rpc('client_payment_proof_submit', {
      p_project: details.project,
      p_request: details.request,
      p_amount: details.amount,
      p_reference: details.reference,
      p_method: details.method,
      p_proof_id: id,
      p_object_key: key,
      p_mime: proof.type,
      p_bytes: bytes.length,
    });
    if (submitted.error)
      throw Error(
        'Submission could not be saved. Check for an earlier submission or reused transaction reference.',
      );
    key = undefined;
    revalidatePath('/client/projects/' + details.project);
    return Response.json({
      success: true,
      message: 'Submitted for bank verification. Not yet marked paid.',
    });
  } catch (error) {
    if (key) await deletePaymentProof(key).catch(() => undefined);
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Could not submit payment evidence',
      },
      { status: 400 },
    );
  }
}
