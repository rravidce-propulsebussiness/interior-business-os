'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { commercialServices } from '../commercial/service';

export type NewCustomerProjectResult = { ok: boolean; message: string; projectId?: string };

const input = z.object({
  customerId:z.uuid(),
  requestId:z.uuid(),
  name:z.string().trim().min(3).max(200),
  industry:z.enum(['construction','interior']),
  type:z.enum(['Residential','Commercial','Renovation','Extension','Apartment','Villa','Office']),
  city:z.string().trim().min(2).max(200),
});

/** Create a separate project for an existing CRN, never a duplicate customer,
 * quotation prospect, lead, or secondary project execution environment. */
export async function createExistingClientProject(
 customerId:string,form:FormData,
):Promise<NewCustomerProjectResult>{
 try{
  const fields=input.parse({
   customerId,requestId:form.get('requestId'),
   name:form.get('name'),industry:form.get('industry'),
   type:form.get('type'),city:form.get('city'),
  });
  const s=await commercialServices('project.create','projects');
  await s.authorization.requireAuthenticatedUser();
  const rpc=s.client.rpc.bind(s.client) as unknown as (
   procedure:string,parameters:Record<string,string>
  )=>Promise<{data:unknown;error:{code?:string;message:string}|null}>;
  const result=await rpc('customer_project_create',{
   p_org:s.org,p_customer:fields.customerId,p_name:fields.name,
   p_industry_key:fields.industry,p_project_type:fields.type,
   p_site_city:fields.city,p_request_id:fields.requestId,
  });
  if(result.error){
   return {ok:false,message:result.error.code==='42883'
     ?'New-project setup is not deployed yet. Contact your administrator.'
     :result.error.message.slice(0,230)};
  }
  const projectId=z.uuid().parse(result.data);
  revalidatePath('/dashboard/projects?customer='+fields.customerId);
  revalidatePath('/dashboard/projects');
  return {ok:true,projectId,message:'Project created for this client.'};
 }catch(error){
  return {ok:false,message:error instanceof z.ZodError
    ?'Enter a valid project name, service, project type and city.'
    :'Could not create project. Check permissions and retry.'};
 }
}
