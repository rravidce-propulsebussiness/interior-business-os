'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

const requestSchema = z.object({
  customerId: z.uuid(),
  projectId: z.uuid(),
  email: z.email().max(254),
  active: z.boolean(),
});

export async function setClientProjectAccess(input: unknown): Promise<{
  ok: boolean; message: string;
}> {
  try {
    const fields = requestSchema.parse(input);
    const services = await serverServices();
    await services.authorization.requireAuthenticatedUser();
    const organization = await activeOrganization();
    if (!organization) return { ok: false, message: 'Select your business first.' };
    const rpc = services.client.rpc.bind(services.client) as unknown as (
      name: string, args: Record<string, string | boolean>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc('client_portal_manage', {
      p_organization_id: organization.organizationId,
      p_customer_id: fields.customerId,
      p_project_id: fields.projectId,
      p_email: fields.email.trim().toLowerCase(),
      p_active: fields.active,
    });
    if (error) return { ok: false, message: error.message.slice(0, 220) };
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard/projects/' + fields.projectId + '/team');
    return {
      ok: true,
      message: fields.active
        ? 'Client access enabled. Share the Client App link; the client must verify this email to sign in.'
        : 'Client access revoked.',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message.slice(0, 220) : 'Could not update client access.',
    };
  }
}
