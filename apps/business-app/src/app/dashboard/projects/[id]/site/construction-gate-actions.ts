'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Json } from '@business-os/database';
import { activeOrganization, serverServices } from '@business-os/auth/server';

export type LaborGateResult = { saved: boolean; message: string };
const uuid = z.uuid();
const day = z.iso.date();

async function call(
  projectId: string,
  operation: 'arrival' | 'departure' | 'review',
  input: Record<string, Json>,
): Promise<LaborGateResult> {
  try {
    uuid.parse(projectId);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Choose a company first');
    const { error } = await services.client.rpc(
      'construction_gate_labor_command',
      {
        p_org: org.organizationId,
        p_project: projectId,
        p_action: operation,
        p_input: input,
      },
    );
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return {
      saved: true,
      message:
        operation === 'review'
          ? 'Manager reconciliation saved; previous security events are preserved.'
          : 'Worker gate event added to the existing Site Delivery security log.',
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error
          ? error.message.slice(0, 240)
          : 'Unable to record labor event.',
    };
  }
}

export async function recordLaborGateEvent(
  projectId: string,
  form: FormData,
): Promise<LaborGateResult> {
  try {
    const operation = z
      .enum(['arrival', 'departure'])
      .parse(form.get('direction'));
    return await call(projectId, operation, {
      work_date: day.parse(form.get('work_date')),
      trade: z
        .string()
        .trim()
        .regex(/^[A-Za-z][A-Za-z /-]{1,69}$/)
        .parse(form.get('trade')),
      workers: z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .parse(form.get('workers')),
      notes: z
        .string()
        .trim()
        .max(1500)
        .parse(form.get('notes') ?? ''),
    });
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error
          ? error.message.slice(0, 220)
          : 'Invalid gate entry.',
    };
  }
}

export async function reviewLaborGateDay(
  projectId: string,
  workDate: string,
  decision: string,
  reason: string,
): Promise<LaborGateResult> {
  try {
    return await call(projectId, 'review', {
      work_date: day.parse(workDate),
      decision: z.enum(['verified', 'discrepancy']).parse(decision),
      reason: z.string().trim().min(12).max(2500).parse(reason),
    });
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error
          ? error.message.slice(0, 220)
          : 'Invalid reconciliation.',
    };
  }
}
