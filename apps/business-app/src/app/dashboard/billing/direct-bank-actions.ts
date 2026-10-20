'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { DomainError, idSchema, safeFailure } from '@business-os/shared';
import { z } from 'zod';

type Result = { message: string; ok: boolean };
const payee = z.object({
  beneficiaryName: z.string().trim().min(2).max(150),
  bankName: z.string().trim().max(150),
  accountNumber: z.union([z.literal(''), z.string().regex(/^[0-9]{6,25}$/)]),
  ifsc: z.union([z.literal(''), z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/)]),
  upiId: z.union([z.literal(''), z.string().regex(/^[A-Za-z0-9._-]{2,128}@[A-Za-z0-9._-]{2,64}$/)]),
}).refine(p => Boolean(p.upiId || (p.accountNumber && p.ifsc)), {
  message: 'Provide a UPI ID or complete bank account details',
});
async function context() {
  const org = await activeOrganization();
  if (!org) throw new DomainError('FORBIDDEN');
  const { authorization, client } = await serverServices();
  return { org: org.organizationId, authorization, client };
}
export async function saveInvoiceBankPayee(_previous: Result, form: FormData): Promise<Result> {
  try {
    const { org, authorization, client } = await context();
    await authorization.requirePermission(org, 'billing.manage');
    const input = payee.parse({
      beneficiaryName: form.get('beneficiaryName'),
      bankName: form.get('bankName') ?? '',
      accountNumber: form.get('accountNumber') ?? '',
      ifsc: String(form.get('ifsc') ?? '').toUpperCase(),
      upiId: form.get('upiId') ?? '',
    });
    const rpc = client.rpc.bind(client) as unknown as (name: string, args: Record<string, unknown>) =>
      Promise<{ error: { message: string } | null }>;
    const result = await rpc('invoice_bank_payee_save', {
      p_org: org, p_name: input.beneficiaryName, p_bank: input.bankName,
      p_account: input.accountNumber, p_ifsc: input.ifsc, p_upi: input.upiId,
    });
    if (result.error) throw new Error('Unable to save company payment details');
    revalidatePath('/dashboard/billing');
    return { ok: true, message: 'Company bank payment details saved.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
export async function createInvoicePaymentRequest(_previous: Result, form: FormData): Promise<Result> {
  try {
    const { org, authorization, client } = await context();
    await authorization.requirePermission(org, 'payment.manage');
    const invoice = idSchema.parse(form.get('invoiceId'));
    const amount = z.coerce.number().finite().positive().max(100000000).parse(form.get('amount'));
    if (Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001)
      throw new DomainError('VALIDATION_FAILED');
    const message = z.string().max(1000).parse(form.get('message') ?? '');
    const rpc = client.rpc.bind(client) as unknown as (name: string, args: Record<string, unknown>) =>
      Promise<{ error: { message: string } | null }>;
    const result = await rpc('invoice_payment_request_create', {
      p_org: org, p_invoice: invoice, p_amount: amount, p_message: message,
    });
    if (result.error) throw new Error('Unable to create invoice payment request');
    revalidatePath('/dashboard/billing/' + invoice);
    return { ok: true, message: 'Payment request created.' };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
