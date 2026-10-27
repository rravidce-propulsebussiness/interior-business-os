'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices, activeOrganization } from '@business-os/auth/server';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();

export async function saveConstructionStageExecution(
  projectId: string,
  stageId: string,
  operation: string,
): Promise<Result> {
  try {
    uuid.parse(projectId);
    uuid.parse(stageId);
    const action = z
      .enum(['start', 'pause', 'resume', 'submit_for_qc', 'reopen'])
      .parse(operation);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Select an active company.');
    const { error } = await services.client.rpc(
      'construction_stage_execution_command' as never,
      {
        p_org: org.organizationId,
        p_project: projectId,
        p_stage: stageId,
        p_action: action,
        p_note: '',
      } as never,
    );
    if (error) throw new Error(error.message);
    for (const route of ['', '/timeline', '/checks', '/execution']) {
      revalidatePath('/dashboard/projects/' + projectId + route);
    }
    revalidatePath('/client');
    const words: Record<typeof action, string> = {
      start:
        'Stage started. Other eligible floors and work stages may proceed in parallel.',
      pause: 'This stage is paused; other active stages are unchanged.',
      resume: 'Stage resumed.',
      submit_for_qc:
        'Field work recorded as ready for formal QC. Certification remains separate.',
      reopen: 'Stage reopened for corrections and additional work.',
    };
    return { saved: true, message: words[action] };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error
          ? error.message
          : 'Stage change could not be saved.',
    };
  }
}
