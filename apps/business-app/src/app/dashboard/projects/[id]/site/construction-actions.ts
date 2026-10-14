'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import {
  defaultConstructionWorkflow,
  expandConstructionStages,
} from '@business-os/core/construction-workflow';

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
  return { client: service.client, organizationId: organization.organizationId };
}
function response(error: unknown): Result {
  return {
    saved: false,
    message:
      error instanceof Error ? error.message.slice(0, 240) : 'Unable to save.',
  };
}
function validateFloors(form: FormData) {
  const raw = z.string().trim().min(1).max(1800).parse(form.get('floors'));
  const names = raw.split(',').map((name) => name.trim()).filter(Boolean);
  if (names.length < 1 || names.length > 64)
    throw new Error('Enter 1 to 64 floors in the intended construction order.');
  const floors = names.map((name) => ({
    name: z.string().min(1).max(100).parse(name),
    code: name
      .normalize('NFKD')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
  }));
  if (floors.some((floor) => !/^[A-Z][A-Z0-9_]*$/.test(floor.code)))
    throw new Error('Each floor needs a name starting with a letter.');
  if (new Set(floors.map((floor) => floor.code)).size !== floors.length)
    throw new Error('Each floor or zone must have a different name.');
  return floors;
}

export async function initializeConstructionWorkflow(
  projectId: string,
  form: FormData,
): Promise<Result> {
  try {
    const floors = validateFloors(form);
    const stages = expandConstructionStages(defaultConstructionWorkflow, floors);
    const { client, organizationId } = await caller(projectId);
    const { error } = await client.rpc('construction_project_command', {
      p_organization_id: organizationId,
      p_project_id: projectId,
      p_action: 'workflow_create',
      p_input: JSON.parse(
        JSON.stringify({
          template: defaultConstructionWorkflow,
          floors,
          stages,
        }),
      ),
    });
    if (error) throw new Error(error.message);
    revalidatePath(pathFor(projectId));
    return {
      saved: true,
      message:
        'Construction planning stages created. Work and certifications are not automatically approved.',
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
    return { saved: true, message: 'Project role deactivated; history retained.' };
  } catch (error) {
    return response(error);
  }
}
