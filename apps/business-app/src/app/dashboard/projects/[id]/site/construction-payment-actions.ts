'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

export type PaymentActionResult = { saved: boolean; message: string };
const uuid = z.uuid();

async function perform(
  projectId: string,
  action: 'stage_link' | 'request_issue',
  input: { item_id: string; stage_id?: string; due_date?: string | null; note?: string },
): Promise<PaymentActionResult> {
  try {
    uuid.parse(projectId);
    uuid.parse(input.item_id);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Choose an active organization.');
    const { error } = await services.client.rpc('construction_payment_command', {
      p_org: org.organizationId,
      p_project: projectId,
      p_action: action,
      p_input: input,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    revalidatePath('/dashboard/billing');
    return {
      saved: true,
      message: action === 'stage_link'
        ? 'Stage linked to the canonical contract payment milestone.'
        : 'Payment request issued through existing Billing. No payment has been recorded.',
    };
  } catch (error) {
    return {
      saved: false,
      message: error instanceof Error ? error.message.slice(0, 230) : 'Payment operation failed.',
    };
  }
}

export async function linkStageToPayment(
  projectId: string,
  itemId: string,
  stageId: string,
): Promise<PaymentActionResult> {
  try {
    return await perform(projectId, 'stage_link', {
      item_id: uuid.parse(itemId),
      stage_id: uuid.parse(stageId),
    });
  } catch (error) {
    return { saved: false, message: error instanceof Error ? error.message : 'Invalid stage' };
  }
}

export async function requestCertifiedStagePayment(
  projectId: string,
  itemId: string,
  form: FormData,
): Promise<PaymentActionResult> {
  try {
    const dateValue = form.get('due_date');
    const dueDate = typeof dateValue === 'string' && dateValue
      ? z.iso.date().parse(dateValue)
      : null;
    const note = z.string().trim().max(3000).parse(form.get('note') ?? '');
    return await perform(projectId, 'request_issue', {
      item_id: uuid.parse(itemId),
      due_date: dueDate,
      note,
    });
  } catch (error) {
    return { saved: false, message: error instanceof Error ? error.message : 'Invalid milestone' };
  }
}
