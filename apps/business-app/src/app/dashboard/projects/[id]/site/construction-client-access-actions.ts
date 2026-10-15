'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();
const email = z.email().max(254);

export async function grantConstructionClientAccess(
  projectId: string,
  value: string,
): Promise<Result> {
  return submit(projectId, 'grant', {
    email: email.parse(value.trim().toLowerCase()),
  });
}

export async function revokeConstructionClientAccess(
  projectId: string,
  accessId: string,
  version: number,
): Promise<Result> {
  return submit(projectId, 'revoke', {
    access_id: uuid.parse(accessId),
    version: z.number().int().positive().parse(version),
  });
}

async function submit(
  projectId: string,
  action: 'grant' | 'revoke',
  input: { email: string } | { access_id: string; version: number },
): Promise<Result> {
  try {
    uuid.parse(projectId);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const org = await activeOrganization();
    if (!org) throw new Error('Select a company first.');
    const { error } = await services.client.rpc(
      'construction_client_access_manage',
      {
        p_org: org.organizationId,
        p_project: projectId,
        p_action: action,
        p_input: input,
      },
    );
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return {
      saved: true,
      message:
        action === 'grant'
          ? 'Verified client access enabled for this project.'
          : 'Client access revoked.',
    };
  } catch (err) {
    return {
      saved: false,
      message:
        err instanceof Error
          ? err.message.slice(0, 250)
          : 'Unable to update access.',
    };
  }
}
