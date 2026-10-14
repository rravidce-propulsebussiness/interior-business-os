'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

export type SiteActionResult = { saved: boolean; message: string };
const uuid = z.uuid();
const notes = z.string().trim().min(12).max(3000);
const ymd = z.iso.date();
const dates = (form: FormData, name: string) => ymd.parse(form.get(name));

async function execute(
  projectId: string,
  operation: string,
  input: Record<string, string | number>,
): Promise<SiteActionResult> {
  try {
    uuid.parse(projectId);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const organization = await activeOrganization();
    if (!organization) throw new Error('Select a company first');
    const { error } = await services.client.rpc('construction_field_command', {
      p_org: organization.organizationId,
      p_project: projectId,
      p_action: operation,
      p_input: input,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return {
      saved: true,
      message: 'Saved in the project curing and field audit history.',
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error ? error.message.slice(0, 220) : 'Unable to save',
    };
  }
}

export async function registerCuringPour(
  projectId: string,
  stageId: string,
  form: FormData,
): Promise<SiteActionResult> {
  try {
    return await execute(projectId, 'curing_plan', {
      stage_id: uuid.parse(stageId),
      pour_reference: z
        .string()
        .trim()
        .min(3)
        .max(140)
        .parse(form.get('pour_reference')),
      pour_date: dates(form, 'pour_date'),
      minimum_days: z.coerce
        .number()
        .int()
        .min(1)
        .max(60)
        .parse(form.get('minimum_days')),
      method: z
        .enum(['ponding', 'sprinkling', 'wet_covering', 'membrane', 'other'])
        .parse(form.get('method')),
      notes: notes.parse(form.get('notes')),
    });
  } catch (error) {
    return {
      saved: false,
      message: error instanceof Error ? error.message : 'Invalid curing plan',
    };
  }
}

export async function recordCuringRound(
  projectId: string,
  planId: string,
  form: FormData,
): Promise<SiteActionResult> {
  try {
    return await execute(projectId, 'curing_observe', {
      plan_id: uuid.parse(planId),
      observed_on: dates(form, 'observed_on'),
      result: z.enum(['wet', 'insufficient']).parse(form.get('result')),
      note: notes.parse(form.get('note')),
    });
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error ? error.message : 'Invalid curing observation',
    };
  }
}

export async function verifyCuringRound(
  projectId: string,
  observationId: string,
  decision: 'verified' | 'rejected',
  reason: string,
): Promise<SiteActionResult> {
  try {
    return await execute(projectId, 'curing_verify', {
      observation_id: uuid.parse(observationId),
      decision: z.enum(['verified', 'rejected']).parse(decision),
      reason: notes.parse(reason),
    });
  } catch (error) {
    return {
      saved: false,
      message: error instanceof Error ? error.message : 'Invalid verification',
    };
  }
}

export async function attachDailyReportToStage(
  projectId: string,
  stageId: string,
  reportId: string,
): Promise<SiteActionResult> {
  try {
    return await execute(projectId, 'report_link', {
      stage_id: uuid.parse(stageId),
      report_id: uuid.parse(reportId),
    });
  } catch (error) {
    return {
      saved: false,
      message: error instanceof Error ? error.message : 'Invalid site report',
    };
  }
}
