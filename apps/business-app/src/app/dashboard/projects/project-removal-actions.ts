'use server';
import { revalidatePath } from 'next/cache';
import { canAccess } from '@business-os/auth';
import { idSchema, safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

/** Remove the delivery project, preserving immutable quotation history. */
export async function removeProjectKeepQuotations(
  id: string,
  version: number,
  confirmation: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const projectId = idSchema.parse(id);
    if (!Number.isInteger(version) || version < 1 || confirmation !== 'DELETE')
      return { ok: false, message: 'Type DELETE to confirm project removal.' };
    const s = await commercialServices('project.manage', 'projects');
    if (
      !canAccess(s.context, {
        organizationId: s.org,
        permission: 'organization.manage',
      })
    )
      return {
        ok: false,
        message: 'Only a company administrator can remove a project.',
      };
    const { data, error } = await s.client.rpc(
      'project_remove_from_workspace',
      {
        p_org: s.org,
        p_project: projectId,
        p_version: version,
        p_confirm: confirmation,
      },
    );
    if (error) {
      if (['23503', '40001', '22023'].includes(error.code || ''))
        return { ok: false, message: error.message };
      return {
        ok: false,
        message: 'Unable to remove this project. Contact an administrator.',
      };
    }
    if (data !== 'permanently_deleted' && data !== 'removed_quotes_preserved')
      return { ok: false, message: 'Project removal could not be confirmed.' };
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/customers');
    return {
      ok: true,
      message:
        data === 'permanently_deleted'
          ? 'Project permanently deleted.'
          : 'Project removed from Projects. Linked quotation history was preserved.',
    };
  } catch (error) {
    return { ok: false, message: safeFailure(error).message };
  }
}
