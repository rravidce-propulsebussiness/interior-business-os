'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

export type TomorrowResult = { saved: boolean; message: string };
const uuid = z.uuid();
const workDate = z.iso.date();
const laborSchema = z.array(z.object({
  trade: z.string().trim().min(2).max(70),
  workers: z.number().int().min(1).max(300),
})).min(1).max(20);
const materialsSchema = z.array(z.object({
  id: uuid, quantity: z.number().positive().max(100000000),
})).max(30);

async function invoke(
  projectId: string,
  action: 'submit' | 'review',
  input: Record<string, unknown>,
): Promise<TomorrowResult> {
  try {
    uuid.parse(projectId);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const organization = await activeOrganization();
    if (!organization) throw new Error('Select a company first.');
    const { error } = await services.client.rpc('construction_tomorrow_command', {
      p_org: organization.organizationId,
      p_project: projectId,
      p_action: action,
      p_input: input,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return { saved: true, message: action === 'submit'
      ? 'Tomorrow work plan submitted. Project manager approval is still required.'
      : 'Project manager review recorded in the site plan history.' };
  } catch (error) {
    return { saved: false, message: error instanceof Error ? error.message.slice(0, 240) : 'Planning failed.' };
  }
}

export async function submitConstructionTomorrowPlan(
  projectId: string, form: FormData,
): Promise<TomorrowResult> {
  try {
    const labor = laborSchema.parse(JSON.parse(z.string().max(4500).parse(form.get('labor'))));
    const materials = materialsSchema.parse(JSON.parse(z.string().max(4500).parse(form.get('materials'))));
    return await invoke(projectId,'submit',{
      stage_id: uuid.parse(form.get('stage_id')),
      work_date: workDate.parse(form.get('work_date')),
      work_summary: z.string().trim().min(10).max(3000).parse(form.get('work_summary')),
      labor,
      materials,
      instructions: z.string().trim().max(2500).parse(form.get('instructions')??''),
    });
  } catch (error) {
    return { saved: false, message: error instanceof Error ? error.message.slice(0,200) : 'Invalid plan requirements.' };
  }
}

export async function reviewConstructionTomorrowPlan(
  projectId: string, planId: string, decision: string, reason: string,
): Promise<TomorrowResult> {
  try {
    return await invoke(projectId,'review',{
      plan_id: uuid.parse(planId),
      decision: z.enum(['approved','changes_requested','withdrawn']).parse(decision),
      reason: z.string().trim().min(12).max(2500).parse(reason),
    });
  } catch (error) {
    return { saved: false, message: error instanceof Error ? error.message.slice(0,200) : 'Invalid review.' };
  }
}
