'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization,serverServices } from '@business-os/auth/server';

type Result={saved:boolean;message:string;uploaded?:boolean};
const kinds=z.enum(['architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan']);

/**
 * One designer action for a drawing revision, using the SAME site media and
 * project_site_command records already consumed by timeline / Designs & Plans.
 * If the file upload succeeds but review submission fails, the project keeps
 * the uploaded PDF; no phantom submitted design is reported.
 */
export async function submitProjectDrawing(projectId:string,form:FormData):Promise<Result>{
 let uploaded=false;
 try{
  const id=z.uuid().parse(projectId);
  const kind=kinds.parse(form.get('kind'));
  const notes=z.string().max(3000).parse(form.get('notes')??'');
  const manual=z.string().trim().max(1500).parse(form.get('reference')??'');
  const file=form.get('file');
  const hasFile=file instanceof File&&file.size>0;
  if(!hasFile&&manual.length<6)throw new Error('Attach a drawing or enter a drawing reference.');
  const service=await serverServices();
  await service.authorization.requireAuthenticatedUser();
  const active=await activeOrganization();
  if(!active)throw new Error('Choose an active company');
  const org=active.organizationId;
  let reference=manual;
  if(hasFile){
   if(!(file instanceof File)||file.size>8*1024*1024)
    throw new Error('Drawing must be smaller than 8 MB');
   if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))
    throw new Error('Use PDF, JPG, PNG or WebP for drawing plans');
   const name=file.name.replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180);
   if(!name)throw new Error('Choose a named drawing file');
   const buffer=Buffer.from(await file.arrayBuffer());
   const {data,error}=await service.client.rpc('project_site_media_put',{
    p_organization_id:org,p_project_id:id,p_category:'design',
    p_filename:name,p_mime:file.type,p_base64:buffer.toString('base64'),
    p_caption:(manual||kind.replaceAll('_',' ')).slice(0,500),
   });
   if(error)throw new Error(error.message.slice(0,220));
   uploaded=true;
   const mediaId=z.uuid().parse(data);
   reference=(manual?manual+' — ':'')+name+' ['+mediaId+']';
  }
  const {error}=await service.client.rpc('project_site_command',{
   p_organization_id:org,p_project_id:id,p_action:'design_submit',
   p_input:{kind,reference,notes},
  });
  if(error)throw new Error(error.message.slice(0,220));
  revalidatePath('/dashboard/projects/'+id);
  revalidatePath('/dashboard/projects/'+id+'/timeline');
  revalidatePath('/dashboard/projects/'+id+'/designs');
  return {saved:true,message:'Drawing submitted for technical review. The project timeline and revision history are updated.'};
 }catch(error){
  if(uploaded)revalidatePath('/dashboard/projects/'+projectId);
  return {
   saved:false,uploaded,
   message:(error instanceof Error?error.message.slice(0,220):'Unable to submit drawing')+
     (uploaded?' The uploaded drawing is saved in Designs & Plans; use its reference when retrying.':''),
  };
 }
}
