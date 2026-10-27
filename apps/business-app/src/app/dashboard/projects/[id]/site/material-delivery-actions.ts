'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();
async function context(projectId: string) {
  uuid.parse(projectId);
  const service = await serverServices();
  await service.authorization.requireAuthenticatedUser();
  const org = await activeOrganization();
  if (!org) throw new Error('Choose an active company.');
  return { client: service.client, org: org.organizationId };
}
function refresh(projectId: string) {
  revalidatePath('/dashboard/projects/' + projectId);
  revalidatePath('/dashboard/projects/' + projectId + '/timeline');
  revalidatePath('/dashboard/projects/' + projectId + '/procurement');
  revalidatePath('/client');
}
export async function saveMaterialOrderPermission(
  projectId: string,
  form: FormData,
): Promise<Result> {
  try {
    const user = uuid.parse(form.get('user_id'));
    const allowed =
      z.enum(['true', 'false']).parse(form.get('allowed')) === 'true';
    const { client, org } = await context(projectId);
    const { error } = await client.rpc(
      'project_material_permission_set' as never,
      {
        p_org: org,
        p_project: projectId,
        p_user: user,
        p_allowed: allowed,
      } as never,
    );
    if (error) throw new Error(error.message);
    refresh(projectId);
    return {
      saved: true,
      message: allowed
        ? 'Material-order permission granted for this project.'
        : 'Material-order permission revoked.',
    };
  } catch (e) {
    return {
      saved: false,
      message:
        e instanceof Error ? e.message : 'Cannot update ordering permission.',
    };
  }
}
export async function saveMaterialDelivery(
  projectId: string,
  form: FormData,
): Promise<Result> {
  try {
    const id = uuid.parse(form.get('material_id'));
    const action = z
      .enum(['place_outside_order', 'update_eta', 'confirm_received'])
      .parse(form.get('action_type'));
    const reference = String(form.get('reference') ?? '').trim();
    const day = String(form.get('delivery_date') ?? '');
    const window = String(form.get('delivery_window') ?? '');
    if (
      action === 'place_outside_order' &&
      (reference.length < 3 || reference.length > 500)
    )
      throw new Error('Enter the outside supplier or order reference.');
    if (action !== 'confirm_received') {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !['morning', 'afternoon', 'evening', 'anytime'].includes(window)
      )
        throw new Error('Choose the expected delivery date and time window.');
    }
    const { client, org } = await context(projectId);
    const { error } = await client.rpc(
      'project_material_delivery_command' as never,
      {
        p_org: org,
        p_project: projectId,
        p_material: id,
        p_action: action,
        p_reference: action === 'place_outside_order' ? reference : null,
        p_expected_date: action === 'confirm_received' ? null : day,
        p_window: action === 'confirm_received' ? null : window,
      } as never,
    );
    if (error) throw new Error(error.message);
    refresh(projectId);
    return {
      saved: true,
      message:
        action === 'place_outside_order'
          ? 'Outside order recorded. Client can see the delivery estimate.'
          : action === 'update_eta'
            ? 'Expected delivery updated for the client.'
            : 'Material arrival confirmed and visible to the client.',
    };
  } catch (e) {
    return {
      saved: false,
      message:
        e instanceof Error ? e.message : 'Cannot save material delivery.',
    };
  }
}
