'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createLabourDisbursementsRepository } from '@business-os/database/labour-disbursements';
import { idSchema, safeFailure } from '@business-os/shared';

type State = { message: string };
const paymentInput = z
  .object({
    projectId: z.union([z.uuid(), z.literal('')]),
    payeeName: z.string().trim().min(2).max(160),
    workDescription: z.string().trim().min(2).max(300),
    workFrom: z.iso.date(),
    workTo: z.iso.date(),
    grossAmount: z.coerce.number().positive().max(999999999999.99),
    deductions: z.coerce.number().nonnegative().max(999999999999.99),
    notes: z.string().max(1000),
  })
  .refine((x) => x.workFrom <= x.workTo, {
    message: 'Work end must be after work start',
  })
  .refine((x) => x.deductions <= x.grossAmount, {
    message: 'Deductions exceed gross wages',
  })
  .refine(
    (x) =>
      Number.isInteger(x.grossAmount * 100) &&
      Number.isInteger(x.deductions * 100),
    {
      message: 'Amounts must use no more than two decimal places',
    },
  );

export async function createLabourDisbursement(
  _state: State,
  form: FormData,
): Promise<State> {
  try {
    const ctx = await activeOrganization();
    if (!ctx) return { message: 'Select your business first.' };
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(ctx.organizationId, 'payment.record');
    const parsed = paymentInput.parse({
      projectId: form.get('projectId') ?? '',
      payeeName: form.get('payeeName'),
      workDescription: form.get('workDescription'),
      workFrom: form.get('workFrom'),
      workTo: form.get('workTo'),
      grossAmount: form.get('grossAmount'),
      deductions: form.get('deductions') ?? '0',
      notes: form.get('notes') ?? '',
    });
    await createLabourDisbursementsRepository(client).create(
      ctx.organizationId,
      {
        ...parsed,
        projectId: parsed.projectId || null,
        grossAmount: parsed.grossAmount.toFixed(2),
        deductions: parsed.deductions.toFixed(2),
      },
    );
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard/billing/labour');
    return {
      message:
        'Labour work entry saved as pending. Mark paid after confirming the actual transfer.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function markLabourDisbursementPaid(
  _state: State,
  form: FormData,
): Promise<State> {
  try {
    const ctx = await activeOrganization();
    if (!ctx) return { message: 'Select your business first.' };
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(ctx.organizationId, 'payment.record');
    const id = idSchema.parse(form.get('id'));
    const method = z
      .enum(['cash', 'upi', 'bank_transfer', 'cheque', 'other'])
      .parse(form.get('method'));
    const reference = z
      .string()
      .trim()
      .max(120)
      .parse(form.get('reference') ?? '');
    if (
      ['upi', 'bank_transfer', 'cheque'].includes(method) &&
      reference.length < 3
    )
      return {
        message:
          'Enter the bank, UPI, or cheque reference before marking this payment as paid.',
      };
    await createLabourDisbursementsRepository(client).markPaid(
      ctx.organizationId,
      id,
      method,
      reference,
    );
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard/billing/labour');
    return {
      message: 'Labour payment recorded. This payment is now locked as paid.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
