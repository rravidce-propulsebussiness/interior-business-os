'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();
const roleSchema = z.enum([
  'project_director',
  'project_manager',
  'architect',
  'structural_engineer',
  'site_engineer',
  'supervisor',
  'quality_inspector',
  'watchman',
  'procurement',
  'storekeeper',
  'electrical_engineer',
  'plumbing_engineer',
  'mep_engineer',
  'quantity_surveyor',
  'accounts_officer',
  'contractor',
]);
const pathFor = (projectId: string) =>
  '/dashboard/projects/' + projectId + '/site';

async function caller(projectId: string) {
  uuid.parse(projectId);
  const service = await serverServices();
  await service.authorization.requireAuthenticatedUser();
  const organization = await activeOrganization();
  if (!organization) throw new Error('Choose an active company first.');
  return {
    client: service.client,
    organizationId: organization.organizationId,
  };
}
function response(error: unknown): Result {
  return {
    saved: false,
    message:
      error instanceof Error ? error.message.slice(0, 240) : 'Unable to save.',
  };
}
/**
 * Recovery only: normal construction timelines are generated when an
 * approved quotation is handed off to its canonical agreement.
 */
export async function syncConstructionFromProjectAgreement(
  projectId: string,
): Promise<Result> {
  try {
    const { client, organizationId } = await caller(projectId);
    const { data, error } = await client
      .from('contracts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .in('status', ['pending', 'active', 'on_hold', 'completed'])
      .order('created_at', { ascending: false })
      .limit(2);
    if (error) throw new Error('Agreement records are not available to this user');
    if (!data?.length)
      return {
        saved: false,
        message: 'An approved quotation and agreement are required before the timeline can be created.',
      };
    if (data.length > 1)
      return {
        saved: false,
        message: 'This project has multiple agreements. Open the correct agreement to synchronize its quoted scope.',
      };
    const { syncQuotedConstructionTimeline } = await import(
      '../../../finance/quote-construction-handoff'
    );
    const outcome = await syncQuotedConstructionTimeline(data[0]!.id);
    if (outcome.reason === 'quote_incomplete')
      return {
        saved: false,
        message: 'The approved quotation does not contain floor-wise construction scope. Correct and approve the quotation first.',
      };
    if (outcome.reason === 'manager_required')
      return {
        saved: false,
        message: 'Only an authorized project manager or company owner can initialize the project stage snapshot.',
      };
    revalidatePath(pathFor(projectId));
    revalidatePath('/dashboard/projects/' + projectId);
    return {
      saved: true,
      message: outcome.reason === 'created'
        ? 'Construction stages and quoted work have been imported from the accepted quotation.'
        : 'This project already has its frozen construction stage plan.',
    };
  } catch (error) {
    return response(error);
  }
}

export async function assignConstructionRole(
  projectId: string,
  form: FormData,
): Promise<Result> {
  try {
    const user = uuid.parse(form.get('user_id'));
    const role = roleSchema.parse(form.get('role'));
    const { client, organizationId } = await caller(projectId);
    const { error } = await client.rpc('construction_project_command', {
      p_organization_id: organizationId,
      p_project_id: projectId,
      p_action: 'role_assign',
      p_input: { user_id: user, role },
    });
    if (error) throw new Error(error.message);
    revalidatePath(pathFor(projectId));
    return { saved: true, message: 'Project role assigned.' };
  } catch (error) {
    return response(error);
  }
}

export async function deactivateConstructionRole(
  projectId: string,
  id: string,
  version: number,
): Promise<Result> {
  try {
    uuid.parse(id);
    const { client, organizationId } = await caller(projectId);
    const { error } = await client.rpc('construction_project_command', {
      p_organization_id: organizationId,
      p_project_id: projectId,
      p_action: 'role_deactivate',
      p_input: { id, version },
    });
    if (error) throw new Error(error.message);
    revalidatePath(pathFor(projectId));
    return {
      saved: true,
      message: 'Project role deactivated; history retained.',
    };
  } catch (error) {
    return response(error);
  }
}
