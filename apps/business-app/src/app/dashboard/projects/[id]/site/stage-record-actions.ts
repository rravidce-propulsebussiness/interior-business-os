'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

const uuid = z.uuid();
const allowedKinds = z.enum([
  'report',
  'material',
  'media',
  'check',
  'curing_round',
  'payment',
]);

export async function linkConstructionStageRecord(
  projectId: string,
  stageId: string,
  kind: string,
  recordId: string,
  contractId?: string,
): Promise<{ saved: boolean; message: string }> {
  try {
    uuid.parse(projectId);
    uuid.parse(stageId);
    uuid.parse(recordId);
    const validKind = allowedKinds.parse(kind);
    if (validKind === 'payment') uuid.parse(contractId);
    else if (contractId) throw new Error('Unexpected contract for site record');
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Select an active company');
    const result = await services.client.rpc('construction_stage_record_command', {
      p_organization_id: org.organizationId,
      p_project_id: projectId,
      p_action: 'link',
      p_input: {
        stage_id: stageId,
        kind: validKind,
        record_id: recordId,
        ...(contractId ? { contract_id: contractId } : {}),
      },
    });
    if (result.error) {
      throw new Error(
        result.error.code === '42501'
          ? 'This project role cannot associate that record with the selected stage.'
          : result.error.message.slice(0, 240),
      );
    }
    revalidatePath('/dashboard/projects/' + projectId);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return {
      saved: true,
      message: 'Record assigned to this stage. The original project record is unchanged.',
    };
  } catch (error) {
    return {
      saved: false,
      message: error instanceof Error ? error.message : 'Unable to link project record',
    };
  }
}
