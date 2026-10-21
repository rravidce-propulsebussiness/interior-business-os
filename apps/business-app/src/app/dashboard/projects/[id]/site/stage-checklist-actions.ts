'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { uploadProjectSiteMedia } from './actions';

type Result = { saved: boolean; message: string };
const uuid = z.uuid();
const materialSchema = z.object({
  item: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().positive().max(100000000),
  unit: z.enum(['bags','kg','tonnes','litres','nos','sqft','sqm','cft','cum','yards','metres','feet']),
  notes: z.string().max(3000).default(''),
}).strict();
const checklistSchema = z.object({
  projectId: uuid,
  stageId: uuid,
  kind: z.enum(['work','check']),
  index: z.number().int().min(0),
  title: z.string().min(3).max(200),
});
async function context(projectId: string) {
  const services = await serverServices();
  await services.authorization.requireAuthenticatedUser();
  const org = await activeOrganization();
  if (!org) throw new Error('Select an active company');
  uuid.parse(projectId);
  return { client: services.client, org: org.organizationId };
}
const refresh = (id:string)=>{
  revalidatePath('/dashboard/projects/'+id);
  revalidatePath('/dashboard/projects/'+id+'/timeline');
  revalidatePath('/dashboard/projects/'+id+'/checks');
  revalidatePath('/dashboard/projects/'+id+'/procurement');
};
export async function saveProjectMaterials(projectId:string,form:FormData):Promise<Result> {
  try {
    const raw=JSON.parse(String(form.get('items')??'null')) as unknown;
    const items=z.array(materialSchema).min(1).max(12).parse(raw);
    const {client,org}=await context(projectId);
    const response=await client.rpc('project_site_material_batch' as never,{
      p_org:org,p_project:projectId,p_items:items,
    } as never);
    if(response.error)throw new Error(response.error.message);
    refresh(projectId);
    return {saved:true,message:items.length+' material requests saved.'};
  } catch(error) {
    return {saved:false,message:error instanceof Error?error.message:'Unable to request materials'};
  }
}
export async function saveProjectStageItem(
  input:{projectId:string;stageId:string;kind:'work'|'check';index:number;title:string},
  form:FormData,
):Promise<Result> {
  try {
    const parsed=checklistSchema.parse(input);
    const decision=String(form.get('decision')??'');
    if(!['done','reopen','failed'].includes(decision) ||
       (decision==='failed'&&parsed.kind==='work'))throw new Error('Invalid checklist decision');
    const note=String(form.get('note')??'');
    if(note.length>2000)throw new Error('Note is too long');
    const file=form.get('file');
    let photoId=String(form.get('photo_id')??'');
    if(photoId)uuid.parse(photoId);
    if(file instanceof File && file.size>0) {
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))
        throw new Error('Upload a JPEG, PNG or WebP inspection photo');
      const media=new FormData();
      media.set('file',file);
      media.set('category','inspection');
      media.set('caption',parsed.title.slice(0,200));
      const result=await uploadProjectSiteMedia(parsed.projectId,media);
      if(!result.saved || !result.mediaId)throw new Error(result.message||'Photo upload failed');
      photoId=result.mediaId;
    }
    if(parsed.kind==='check'&&decision==='done'&&!photoId)
      throw new Error('Upload or choose an inspection photo before marking this check passed');
    const {client,org}=await context(parsed.projectId);
    const response=await client.rpc('project_stage_checklist_command' as never,{
      p_org:org,p_project:parsed.projectId,p_stage:parsed.stageId,
      p_kind:parsed.kind,p_index:parsed.index,p_title:parsed.title,
      p_action:decision,p_note:note,p_photo:photoId||null,
    } as never);
    if(response.error)throw new Error(response.error.message);
    refresh(parsed.projectId);
    return {saved:true,message:decision==='done'?'Item completed and recorded.':
      decision==='failed'?'Failed check recorded.':'Item reopened.'};
  } catch(error) {
    return {saved:false,message:error instanceof Error?error.message:'Unable to update checklist'};
  }
}
