'use server';
import { revalidatePath } from 'next/cache';
import { idSchema, safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

/** Hard-delete only an unencumbered project; never archive on failure. */
export async function permanentlyDeleteProject(
  id: string, version: number, confirmation: string,
): Promise<{ok: boolean; message: string}> {
  try {
    const projectId = idSchema.parse(id);
    if (!Number.isInteger(version) || version < 1 || confirmation !== 'DELETE')
      return {ok:false,message:'Type DELETE to confirm permanent deletion.'};
    const s = await commercialServices('project.manage','projects');
    if (!s.allowed('organization.manage'))
      return {ok:false,message:'Only a company administrator can permanently delete a project.'};
    const {data,error}=await s.client.rpc('project_permanent_delete',{
      p_org:s.org, p_project:projectId, p_version:version,p_confirm:confirmation,
    });
    if(error){
      if(['23503','40001','22023'].includes(error.code||''))
        return {ok:false,message:error.message};
      return {ok:false,message:'Unable to permanently delete this project. Contact an administrator.'};
    }
    if(data!==true)return {ok:false,message:'Deletion could not be confirmed.'};
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/customers');
    return {ok:true,message:'Project permanently deleted.'};
  } catch(error) {
    return {ok:false,message:safeFailure(error).message};
  }
}
