'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';

export type ResetPreview={
 company:string;
 total:number;
 counts:Record<string,number>;
 signature:string;
 required_phrase:string;
};

export async function ownerResetTestData(input:{
 signature:string;phrase:string;
}):Promise<{success:boolean;message:string}>{
 try{
  const context=await activeOrganization();
  if(!context) return {success:false,message:'Select a company first.'};
  const {authorization,client}=await serverServices();
  const access=await authorization.requirePermission(
    context.organizationId,'organization.manage',
  );
  if(!access.roles.some(role=>role.name.toLowerCase()==='owner'))
   return {success:false,message:'Only the company Owner may reset its test data.'};
  if(!/^[0-9a-f]{32}$/.test(input.signature)||
     input.phrase.length>220||!input.phrase.startsWith('RESET '))
   return {success:false,message:'Invalid reset confirmation.'};
  const {data,error}=await client.rpc('owner_test_data_reset_execute',{
   p_org:context.organizationId,
   p_phrase:input.phrase,p_signature:input.signature,
  });
  if(error) return {success:false,message:
   error.code==='40001'?'Company data changed. Refresh the preview and try again.':
   error.code==='23503'?'Linked records blocked reset. No data was removed.':
   error.code==='42501'?'Only the company Owner can reset test data.':
   'Reset could not complete. No partial deletion was committed.'};
  const result=data as {success?:boolean;deleted_rows?:number}|null;
  if(result?.success!==true) return {
   success:false,message:'Reset did not complete.'};
  revalidatePath('/dashboard','layout');
  revalidatePath('/dashboard/settings');
  return {success:true,message:
   'Reset completed. '+(result.deleted_rows??0)+' operational test records removed. Your company and settings were kept.'};
 }catch{return {success:false,message:'Reset could not complete. Nothing was confirmed as deleted.'};}
}
