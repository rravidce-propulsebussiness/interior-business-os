'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

export type ClientShareResult = {
  saved: boolean;
  message: string;
  token?: string;
};

const uuid = z.uuid();

async function command(
  projectId: string,
  operation:
    'share_create' | 'share_revoke' | 'report_publish' | 'report_unpublish',
  input: Record<string, string>,
): Promise<ClientShareResult> {
  try {
    uuid.parse(projectId);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const organization = await activeOrganization();
    if (!organization) throw new Error('Select an active company.');
    const { data, error } = await services.client.rpc(
      'construction_client_manage',
      {
        p_org: organization.organizationId,
        p_project: projectId,
        p_action: operation,
        p_input: input,
      },
    );
    if (error) throw new Error(error.message);
    const result = z
      .object({
        share_id: uuid.optional(),
        event_id: uuid.optional(),
        token: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
      })
      .parse(data);
    revalidatePath('/dashboard/projects/' + projectId + '/site');
    return {
      saved: true,
      message:
        operation === 'share_create'
          ? 'Secure link created. Copy it now; its token is not stored in readable form.'
          : operation === 'share_revoke'
            ? 'Customer link revoked.'
            : operation === 'report_publish'
              ? 'Manager-approved site report published to the client portal.'
              : 'Site report withdrawn from the client portal.',
      ...(result.token ? { token: result.token } : {}),
    };
  } catch (error) {
    return {
      saved: false,
      message:
        error instanceof Error
          ? error.message.slice(0, 240)
          : 'Client sharing failed.',
    };
  }
}

export async function createConstructionClientLink(
  projectId: string,
): Promise<ClientShareResult> {
  return command(projectId, 'share_create', {});
}
export async function revokeConstructionClientLink(
  projectId: string,
  shareId: string,
): Promise<ClientShareResult> {
  return command(projectId, 'share_revoke', { share_id: uuid.parse(shareId) });
}
export async function publishConstructionReport(
  projectId: string,
  reportId: string,
  publish: boolean,
): Promise<ClientShareResult> {
  return command(projectId, publish ? 'report_publish' : 'report_unpublish', {
    report_id: uuid.parse(reportId),
  });
}
