'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  activeOrganization,
  serverServices,
} from '@business-os/auth/server';

const uuid = z.uuid();
const allowedActions = new Set([
  'initialize','assign','design_submit','design_decide','client_approve',
  'execution_start','report_add','material_add','material_update',
  'check_add','check_update','gate_add','handover',
]);
type Result = { saved: boolean; message: string };
const pathFor = (project: string) => '/dashboard/projects/' + project + '/site';

async function context(project: string) {
  uuid.parse(project);
  const s = await serverServices();
  await s.authorization.requireAuthenticatedUser();
  const org = await activeOrganization();
  if (!org) throw new Error('Select an active company');
  return { client: s.client, org: org.organizationId };
}

function fromForm(form: FormData) {
  const data: Record<string, string | boolean> = {};
  for (const [key, value] of form) {
    if (key === '$ACTION_ID' || key.startsWith('$ACTION_') || key === 'file')
      continue;
    if (typeof value !== 'string' || value.length > 6000)
      throw new Error('Invalid field length');
    if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid field name');
    data[key] = value;
  }
  if ('active' in data) data.active = data.active === 'true';
  return data;
}

export async function saveProjectSite(
  project: string,
  operation: string,
  form: FormData,
): Promise<Result> {
  try {
    if (!allowedActions.has(operation)) throw new Error('Unknown project action');
    const { client, org } = await context(project);
    const { error } = await client.rpc('project_site_command', {
      p_organization_id: org,
      p_project_id: project,
      p_action: operation,
      p_input: fromForm(form),
    });
    if (error) throw new Error(error.code === '42501'
      ? 'This project role does not allow that action'
      : error.message.slice(0, 220));
    revalidatePath(pathFor(project));
    return { saved: true, message: 'Project record saved.' };
  } catch (error) {
    return {
      saved: false,
      message: error instanceof Error ? error.message : 'Unable to save project record',
    };
  }
}

export async function uploadProjectSiteMedia(
  project: string,
  form: FormData,
): Promise<Result> {
  try {
    const { client, org } = await context(project);
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 8 * 1024 * 1024)
      throw new Error('Choose a photo, PDF or short MP4 up to 8 MB');
    if (!['image/jpeg','image/png','image/webp','video/mp4','application/pdf'].includes(file.type))
      throw new Error('Unsupported file type');
    const category = String(form.get('category') ?? '');
    const caption = String(form.get('caption') ?? '');
    const filename = file.name.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0,180);
    if (caption.length > 500) throw new Error('Caption too long');
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) throw new Error('File too large');
    const { error } = await client.rpc('project_site_media_put', {
      p_organization_id: org,
      p_project_id: project,
      p_category: category,
      p_filename: filename || 'media',
      p_mime: file.type,
      p_base64: bytes.toString('base64'),
      p_caption: caption,
    });
    if (error) throw new Error(error.code === '42501' ? 'Project media access denied'
      : error.message.slice(0, 220));
    revalidatePath(pathFor(project));
    return { saved: true, message: 'Media saved privately to this project.' };
  } catch (error) {
    return { saved: false, message: error instanceof Error ? error.message : 'Upload failed' };
  }
}
