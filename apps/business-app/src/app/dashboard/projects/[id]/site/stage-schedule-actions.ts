'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type Result = { saved: boolean; message: string; version?: number };
const date = z.iso.date();
const inputSchema = z.object({
  projectId: z.uuid(),
  stageId: z.uuid(),
  kind: z.enum(['work', 'material', 'check', 'test', 'qc']),
  index: z.number().int().min(0).max(49),
  title: z.string().trim().min(2).max(180),
  version: z.number().int().min(0),
});
/** Dates are planning-only: no stage start/completion/QC or payment side effect. */
export async function saveProjectItemSchedule(
  value: z.input<typeof inputSchema>,
  form: FormData,
): Promise<Result> {
  try {
    const item = inputSchema.parse(value);
    const start = date.parse(String(form.get('planned_start') ?? ''));
    const finish = date.parse(String(form.get('planned_finish') ?? ''));
    if (finish < start)
      throw new Error('Finish date cannot be before start date');
    const note = z
      .string()
      .max(500)
      .parse(String(form.get('note') ?? ''));
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const active = await activeOrganization();
    if (!active) throw new Error('Select a company');
    const response = await services.client.rpc(
      'project_stage_item_schedule_save' as never,
      {
        p_org: active.organizationId,
        p_project: item.projectId,
        p_stage: item.stageId,
        p_kind: item.kind,
        p_index: item.index,
        p_title: item.title,
        p_start: start,
        p_finish: finish,
        p_note: note,
        p_expected_version: item.version,
      } as never,
    );
    if (response.error) throw new Error(response.error.message);
    revalidatePath('/dashboard/projects/' + item.projectId);
    revalidatePath('/dashboard/projects/' + item.projectId + '/timeline');
    return {
      saved: true,
      message: 'Planned dates saved. Physical work and QC remain unchanged.',
      version: item.version + 1,
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error ? error.message : 'Unable to schedule work',
    };
  }
}
