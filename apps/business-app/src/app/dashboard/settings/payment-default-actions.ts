'use server';
import {revalidatePath} from 'next/cache';
import {activeOrganization,serverServices} from '@business-os/auth/server';
import {companyConstructionPaymentRows} from '@business-os/core/company-construction-defaults';

export type DefaultPaymentState={saved:boolean;message:string};
export async function saveConstructionPaymentDefaults(
 _previous:DefaultPaymentState,form:FormData,
):Promise<DefaultPaymentState> {
 const raw=form.get('rows');
 if(typeof raw!=='string'||raw.length>45000)return {saved:false,message:'Invalid payment schedule.'};
 let payload:unknown;
 try{payload=JSON.parse(raw);}catch{return {saved:false,message:'Invalid payment schedule.'};}
 const validated=companyConstructionPaymentRows.safeParse(payload);
 if(!validated.success)return {saved:false,message:validated.error.issues[0]?.message??'Invalid milestones'};
 try{
  const context=await activeOrganization();
  if(!context)return {saved:false,message:'Sign in to manage company defaults.'};
  const {client,authorization}=await serverServices();
  await authorization.requirePermission(context.organizationId,'organization.manage');
  const {error}=await client.rpc('organization_construction_payment_defaults_save' as never,{
   p_org:context.organizationId,p_rows:validated.data,
  } as never);
  if(error)return {saved:false,message:'Unable to save company defaults: '+error.message};
  revalidatePath('/dashboard/settings');
  return {saved:true,message:'Company payment stages, work, materials and checks saved. Existing quotations and projects are unchanged.'};
 }catch{return {saved:false,message:'Only authorized company managers can save payment defaults.'};}
}
