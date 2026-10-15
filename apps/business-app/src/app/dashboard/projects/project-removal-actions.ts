'use server';
import { revalidatePath } from 'next/cache';
import { idSchema, safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

/** Reversible removal preserves agreements, payments and site history. */
export async function setProjectArchived(
  id: string,
  archived: boolean,
): Promise<{ ok: boolean; message: string }> {
  try {
    const projectId = idSchema.parse(id);
    const s = await commercialServices('project.manage', 'projects');
    const { data: project, error } = await s.client
      .from('projects')
      .select('id,version,status')
      .eq('organization_id', s.org)
      .eq('id', projectId)
      .maybeSingle();
    if (error || !project)
      return { ok: false, message: 'Project not found in this company.' };
    const status = archived ? 'inactive' : 'active';
    if (project.status === status)
      return { ok: true, message: archived ? 'Project already archived.' : 'Project already active.' };
    await s.commercial.saveEntity(s.org, 'projects', {
      id: project.id,
      version: project.version,
      status,
    });
    revalidatePath('/dashboard/projects');
    return {
      ok: true,
      message: archived
        ? 'Project archived. Agreements and site history were preserved.'
        : 'Project restored.',
    };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
