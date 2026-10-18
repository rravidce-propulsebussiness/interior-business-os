'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization,serverServices } from '@business-os/auth/server';

type Result={ok:boolean;message:string};
const id=z.uuid();

function invalidate(projectId:string){
 for(const section of ['','/documents','/payments','/timeline','/designs']){
  revalidatePath('/dashboard/projects/'+projectId+section);
 }
}
export async function saveProjectSiteSurvey(projectId:string,form:FormData):Promise<Result>{
 try{
  id.parse(projectId);
  const kind=z.enum(['inspection','measurements']).parse(form.get('kind'));
  const details=z.string().trim().min(20).max(3000).parse(form.get('details'));
  const services=await serverServices();
  await services.authorization.requireAuthenticatedUser();
  const org=await activeOrganization();
  if(!org)throw new Error('Select a company');
  const {error}=await services.client.rpc('project_preflight_save',{
   p_org:org.organizationId,p_project:projectId,p_kind:kind,p_details:details,
  });
  if(error)throw new Error(error.message.slice(0,220));
  invalidate(projectId);
  return {ok:true,message:kind==='inspection'?'Site inspection recorded. Next: site measurements.':
   'Measurements recorded. You can now prepare the floor plan.'};
 }catch(error){return {ok:false,message:error instanceof z.ZodError
  ?'Enter at least 20 characters of site details and select an inspection type.'
  :error instanceof Error?error.message:'Unable to save site survey.'};}
}
export async function prepareProjectAdvanceInvoice(projectId:string,form:FormData):Promise<Result>{
 try{
  id.parse(projectId);
  const percentage=z.coerce.number().min(0.01).max(100).refine(v=>Number.isInteger(v*100),
   'Use at most two decimal places').parse(form.get('percent'));
  const services=await serverServices();
  await services.authorization.requireAuthenticatedUser();
  const org=await activeOrganization();
  if(!org)throw new Error('Select a company');
  const {error}=await services.client.rpc('project_advance_proforma_prepare',{
   p_org:org.organizationId,p_project:projectId,p_percent:percentage,
  });
  if(error)throw new Error(error.message.slice(0,220));
  invalidate(projectId);
  return {ok:true,message:'Advance proforma issued. Payment is still pending until a receipt is recorded.'};
 }catch(error){return {ok:false,message:error instanceof z.ZodError
  ?'Enter an advance percentage between 0.01% and 100%.'
  :error instanceof Error?error.message:'Unable to prepare the advance request.'};}
}
