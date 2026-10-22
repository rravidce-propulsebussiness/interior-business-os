'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
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
export async function saveProjectMaterials(projectId:string,form:FormData,stageId?:string):Promise<Result> {
  try {
    const raw=JSON.parse(String(form.get('items')??'null')) as unknown;
    const items=z.array(materialSchema).min(1).max(12).parse(raw);
    const {client,org}=await context(projectId);
    if(stageId)uuid.parse(stageId);
    const response=stageId
      ?await client.rpc('project_stage_material_batch' as never,{
         p_org:org,p_project:projectId,p_stage:stageId,p_items:items,
       } as never)
      :await client.rpc('project_site_material_batch' as never,{
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

const batchCheck = z.object({
 index:z.number().int().min(0).max(200),
 title:z.string().trim().min(3).max(200),
 photo_id:uuid.nullable(),
 note:z.string().max(2000).default(''),
}).strict();
export async function passProjectStageChecks(
 projectId:string,stageId:string,form:FormData,
):Promise<Result> {
 try {
  uuid.parse(stageId);
  const chosen=z.array(batchCheck).min(1).max(30).parse(
   JSON.parse(String(form.get('items')??'null')) as unknown);
  const finish=form.get('finish')==='true';
  if(new Set(chosen.map(item=>item.index)).size!==chosen.length)
   throw new Error('Duplicate checklist item selected');
  const evidence=form.get('file');
  let commonPhoto=String(form.get('shared_photo_id')??'').trim();
  if(commonPhoto)uuid.parse(commonPhoto);
  if(evidence instanceof File && evidence.size>0){
   if(!['image/jpeg','image/png','image/webp'].includes(evidence.type))
    throw new Error('Choose a JPEG, PNG or WebP inspection photo');
   const media=new FormData();
   media.set('file',evidence);media.set('category','inspection');
   media.set('caption','Selected stage inspection evidence');
   const uploaded=await uploadProjectSiteMedia(projectId,media);
   if(!uploaded.saved||!uploaded.mediaId)throw new Error(uploaded.message);
   commonPhoto=uploaded.mediaId;
  }
  if(commonPhoto&&chosen.length>1&&form.get('confirm_shared')!=='true')
   throw new Error('Confirm the shared photo documents every selected inspection');
  const items=chosen.map(item=>({
   index:item.index,title:item.title,note:item.note,
   photo_id:commonPhoto||item.photo_id,
  }));
  if(items.some(item=>!item.photo_id))
   throw new Error('Choose relevant photo evidence for each selected check');
  const {client,org}=await context(projectId);
  const response=await client.rpc('project_stage_checklist_batch_command' as never,{
   p_org:org,p_project:projectId,p_stage:stageId,p_items:items,p_finish:finish,
  } as never);
  if(response.error)throw new Error(response.error.message);
  refresh(projectId);
  revalidatePath('/dashboard/projects/'+projectId+'/execution');
  return {saved:true,message:finish
   ?items.length+' checks passed; field work submitted for QC. The next eligible stage can now be started.'
   :items.length+' checks passed. Formal QC approval remains separate.'};
 }catch(error){
  return {saved:false,message:error instanceof Error?error.message:'Unable to pass selected checks'};
 }
}

/** Sends a separately approved site material to a real published marketplace seller.
 * A seller request is not a purchase order, payment or a delivered material.
 */
export async function requestMaterialFromMarketplace(projectId:string,form:FormData):Promise<Result>{
 try{
  const materialId=uuid.parse(form.get('materialId'));
  const productId=uuid.parse(form.get('productId'));
  const key=randomUUID();
  const {client,org}=await context(projectId);
  const {authorization}=await serverServices();
  await authorization.requirePermission(org,'purchase.manage');
  const result=await client.rpc('project_site_marketplace_order' as never,{
   p_org:org,p_project:projectId,p_material:materialId,p_product:productId,
   p_request_key:key,
  } as never);
  if(result.error)throw new Error(result.error.message);
  refresh(projectId);
  revalidatePath('/dashboard/marketplace/orders');
  return {saved:true,message:'Supplier request placed. Seller acceptance and delivery are separate steps.'};
 }catch(error){
  return {saved:false,message:error instanceof Error?error.message:'Unable to send marketplace request'};
 }
}
