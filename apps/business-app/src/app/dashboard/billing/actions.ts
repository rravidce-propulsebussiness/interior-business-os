'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { financeServices } from '../finance/service';
import { createTradeBillingRepository } from '@business-os/database/trade-billing';
import { safeFailure, idSchema } from '@business-os/shared';

const party = z
  .object({
    name: z.string().trim().min(2).max(200),
    address: z.string().trim().min(5).max(2000),
    gstin: z.union([
      z.literal(''),
      z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/),
    ]),
    state: z.string().regex(/^[0-9]{2}$/),
  })
  .refine((p) => !p.gstin || p.gstin.slice(0, 2) === p.state);
const profile = party.extend({
  prefix: z.string().regex(/^[A-Z0-9]{2,6}$/),
});
const line = z.object({
  description: z.string().trim().min(2).max(350),
  hsn: z.string().trim().min(2).max(10),
  unit: z.string().trim().min(1).max(20),
  quantity: z.number().positive().max(100000),
  rate: z.number().nonnegative().max(100000000),
  gstRate: z.number().nonnegative().max(40),
});
const draft = z.object({
  id: z.uuid().optional(),
  kind: z.enum(['sales_invoice', 'purchase_bill']),
  issueDate: z.iso.date(),
  dueDate: z.union([z.iso.date(), z.literal('')]),
  counterparty: party,
  placeOfSupply: z.string().regex(/^[0-9]{2}$/),
  deliveryAddress: z.string().max(2000),
  reverseCharge: z.boolean(),
  lines: z.array(line).min(1).max(30),
  notes: z.string().max(2000),
  reference: z.string().max(40),
});

export async function saveTradeProfile(
  _state: { message: string },
  form: FormData,
) {
  try {
    const s = await financeServices('billing.manage');
    const input = profile.parse({
      name: form.get('name'),
      address: form.get('address'),
      state: form.get('state'),
      gstin: form.get('gstin') ?? '',
      prefix: form.get('prefix'),
    });
    await createTradeBillingRepository(s.client, s.org).saveProfile(input);
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard/billing/settings');
    return { message: 'Company billing details saved.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function saveTradeDocument(
  _state: { message: string },
  form: FormData,
) {
  let id: string;
  try {
    const s = await financeServices('invoice.create');
    const raw = JSON.parse(String(form.get('payload') ?? '')) as unknown;
    const input = draft.parse(raw);
    const { id: existingId, ...draftData } = input;
    id = await createTradeBillingRepository(s.client, s.org).save({
      ...draftData,
      ...(existingId ? { id: existingId } : {}),
    });
    revalidatePath('/dashboard/billing');
  } catch (error) {
    return { message: safeFailure(error).message };
  }
  redirect('/dashboard/billing/' + id + '?saved=1');
}
export async function issueTradeDocument(form: FormData) {
  const id = idSchema.parse(form.get('id'));
  const path = '/dashboard/billing/' + id;
  try {
    const s = await financeServices('invoice.issue');
    await createTradeBillingRepository(s.client, s.org).issue(id);
    revalidatePath(path);
    revalidatePath('/dashboard/billing');
  } catch (error) {
    redirect(path + '?error=' + encodeURIComponent(safeFailure(error).message));
  }
  redirect(path + '?issued=1');
}
export async function voidTradeDocument(form: FormData) {
  const id = idSchema.parse(form.get('id'));
  const path = '/dashboard/billing/' + id;
  try {
    const s = await financeServices('invoice.manage');
    const reason = z.string().trim().min(5).max(300).parse(form.get('reason'));
    await createTradeBillingRepository(s.client, s.org).void(id, reason);
    revalidatePath(path);
    revalidatePath('/dashboard/billing');
  } catch (error) {
    redirect(path + '?error=' + encodeURIComponent(safeFailure(error).message));
  }
  redirect(path + '?voided=1');
}
export async function recordTradePayment(form: FormData) {
  const id = idSchema.parse(form.get('id'));
  const path = '/dashboard/billing/' + id;
  try {
    const s = await financeServices('payment.record');
    const amount = z.coerce.number().positive().parse(form.get('amount'));
    const date = z.iso.date().parse(form.get('date'));
    const mode = z
      .enum(['cash', 'bank', 'upi', 'cheque', 'other'])
      .parse(form.get('mode'));
    const reference = z
      .string()
      .trim()
      .max(120)
      .parse(form.get('reference') ?? '');
    await createTradeBillingRepository(s.client, s.org).payment(
      id,
      amount,
      date,
      mode,
      reference,
    );
    revalidatePath(path);
    revalidatePath('/dashboard/billing');
  } catch (error) {
    redirect(path + '?error=' + encodeURIComponent(safeFailure(error).message));
  }
  redirect(path + '?paid=1');
}
