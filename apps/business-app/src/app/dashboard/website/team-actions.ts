'use server';
import { revalidatePath } from 'next/cache';
import { websiteServices } from './service';
export async function updateWebsiteMember(
  site: string,
  user: string,
  operation: 'developer' | 'assign' | 'remove',
) {
  try {
    const s = await websiteServices('website.scope.manage');
    const r =
      operation === 'developer'
        ? await s.client.rpc('website_grant_developer', {
            p_organization_id: s.context.organizationId,
            p_website_id: site,
            p_user_id: user,
          })
        : await s.client.rpc('website_assign', {
            p_organization_id: s.context.organizationId,
            p_website_id: site,
            p_user_id: user,
            p_active: operation === 'assign',
          });
    if (r.error) throw r.error;
    revalidatePath(`/dashboard/website/${site}/team`);
    return { message: 'Website access updated.' };
  } catch {
    return {
      message:
        'Access could not be changed. Check role-management permission and reload.',
    };
  }
}
