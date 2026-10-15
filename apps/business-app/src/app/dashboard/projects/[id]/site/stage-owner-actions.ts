'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

const formSchema = z.object({
  projectId: z.uuid(),
  stageId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  title: z.string().trim().min(3).max(180),
  explanation: z.string().max(800),
  activities: z.array(z.string().trim().min(3).max(240)).min(1).max(80),
  displayOrder: z.number().int().min(1).max(900),
  reason: z.string().trim().min(8).max(1000),
}).strict();

export async function editQuotedProjectStage(raw: unknown): Promise<{
  saved: boolean;
  message: string;
}> {
  try {
    const input = formSchema.parse(raw);
    const org = await activeOrganization();
    if (!org) throw new Error('Select an active company.');
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const { error } = await services.client.rpc('project_stage_owner_edit', {
      p_org: org.organizationId,
      p_project: input.projectId,
      p_stage: input.stageId,
      p_expected_version: input.expectedVersion,
      p_input: {
        title: input.title,
        explanation: input.explanation,
        activities: input.activities,
        display_order: input.displayOrder,
        reason: input.reason,
      },
    });
    if (error) {
      throw new Error(error.code === '42501'
        ? 'Only the company owner can edit unexecuted stages. Contract scope and quality-approved work cannot be changed here.'
        : error.code === '40001'
          ? 'Another change was saved. Refresh the project and try again.'
          : error.message.slice(0, 240));
    }
    revalidatePath('/dashboard/projects/' + input.projectId);
    revalidatePath('/dashboard/projects/' + input.projectId + '/site');
    return { saved: true, message: 'Stage planning change saved with owner audit history.' };
  } catch (error) {
    return {
      saved: false,
      message: error instanceof Error ? error.message : 'Stage edit was not saved.',
    };
  }
}
