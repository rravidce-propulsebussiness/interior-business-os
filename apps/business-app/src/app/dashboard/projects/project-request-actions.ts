'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

const responseSchema = z.object({
  projectId: z.uuid(),
  requestId: z.uuid(),
  status: z.enum(['in_review', 'accepted', 'declined', 'resolved']),
  response: z.string().trim().min(2).max(2000),
});
export async function respondToProjectClientRequest(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const values = responseSchema.parse({
      projectId: form.get('projectId'),
      requestId: form.get('requestId'),
      status: form.get('status'),
      response: form.get('response'),
    });
    const org = await activeOrganization();
    if (!org) throw new Error('Company access required.');
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const { error } = await services.client.rpc(
      'project_client_request_respond',
      {
        p_org: org.organizationId,
        p_project_id: values.projectId,
        p_request_id: values.requestId,
        p_status: values.status,
        p_response: values.response,
      },
    );
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard/projects/' + values.projectId);
    revalidatePath('/dashboard/projects/' + values.projectId + '/timeline');
    revalidatePath('/client/projects/' + values.projectId);
    return { ok: true, message: 'Response saved and shared with the client.' };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message.slice(0, 220)
          : 'Unable to save response.',
    };
  }
}
