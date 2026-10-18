'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization,serverServices } from '@business-os/auth/server';
import { syncQuotedConstructionTimeline } from '../finance/quote-construction-handoff';

type Result={saved:boolean;message:string;contractId?:string};

/** Owner-only project handoff. The issued quote remains immutable even when it
 * belongs to an earlier sales prospect that the Won lead used for quoting.
 * This prepares a PENDING agreement; signed PDF evidence is a separate step.
 */
export async function prepareAgreementFromProjectQuote(
 projectId:string,revisionId:string,
):Promise<Result>{
 try{
  z.uuid().parse(projectId);
  z.uuid().parse(revisionId);
  const org=await activeOrganization();
  if(!org)throw new Error('Select a company');
  const services=await serverServices();
  await services.authorization.requireAuthenticatedUser();
  const result=await services.client.rpc('contract_create_for_project_quote',{
   p_org:org.organizationId,p_project:projectId,p_revision:revisionId,
  });
  if(result.error){
   throw new Error(result.error.code==='42883'?
    'Agreement setup needs its latest database migration. Contact the administrator.':
    result.error.code==='42501'?'Company owner agreement access required.':
    result.error.message.slice(0,230));
  }
  const contractId=z.uuid().parse(result.data);
  let message='Agreement prepared from the finalized quote. Upload the signed PDF and record its evidence.';
  try{
   const synced=await syncQuotedConstructionTimeline(contractId);
   if(synced.reason==='quote_incomplete')
    message+=' Correct the quote scope before importing its timeline.';
   else if(synced.reason==='manager_required')
    message+=' A project manager must import its planned timeline.';
  }catch{
   message+=' The planned timeline can be imported later; the agreement is saved.';
  }
  revalidatePath('/dashboard/projects/'+projectId);
  revalidatePath('/dashboard/projects/'+projectId+'/documents');
  revalidatePath('/dashboard/projects/'+projectId+'/timeline');
  return {saved:true,contractId,message};
 }catch(e){
  return {saved:false,message:e instanceof Error?e.message:'Could not prepare agreement.'};
 }
}
