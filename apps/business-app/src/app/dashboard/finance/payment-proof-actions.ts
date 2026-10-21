'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { financeServices } from './service';

export type ProofReviewState={message:string;success:boolean};
const schema=z.object({
 proof:z.uuid(),action:z.enum(['approve','reject']),
 method:z.uuid().optional(),
 confirm:z.boolean(),allowPartial:z.boolean(),
 note:z.string().trim().max(1000),
});
export async function reviewClientPaymentProof(
 _previous:ProofReviewState,form:FormData,
):Promise<ProofReviewState>{
 try{
  const input=schema.parse({
   proof:form.get('proof'),action:form.get('action'),
   method:form.get('method')||undefined,
   confirm:form.get('confirm')==='on',
   allowPartial:form.get('allowPartial')==='on',
   note:form.get('note')??'',
  });
  const s=await financeServices('payment.record');
  const reviewer=s.context.roles.some(role=>['owner','accountant']
   .includes(role.name.toLowerCase()));
  const owner=s.context.roles.some(role=>role.name.toLowerCase()==='owner');
  if(!reviewer)return {message:'Owner or Accountant access required.',success:false};
  if(input.allowPartial&&!owner)
   return {message:'Only the Owner may authorize partial payment.',success:false};
  if(input.action==='approve'&&!input.confirm)
   return {message:'Verify the actual bank credit first.',success:false};
  if(input.action==='approve'&&!input.method)
   return {message:'Select the account / payment method.',success:false};
  if(input.action==='reject'&&input.note.length<8)
   return {message:'Give the client a reason (8+ characters).',success:false};
  const {data,error}=await s.client.rpc('staff_payment_proof_decide',{
   p_org:s.org,p_proof:input.proof,p_action:input.action,
   p_method:input.method??undefined,p_confirm_bank_credit:input.confirm,
   p_allow_partial:input.allowPartial,p_note:input.note,
  });
  if(error||!data)return {message:error?.message?.slice(0,180)
    ??'Unable to save review.',success:false};
  revalidatePath('/dashboard/finance');
  revalidatePath('/dashboard','layout');
  revalidatePath('/client','layout');
  return {success:true,message:input.action==='approve'
   ?'Bank credit confirmed. Existing Finance payment recorded and official receipt generated.'
   :'Evidence rejected. Client can submit corrected details.'};
 }catch{return {success:false,message:'Review failed. No payment was recorded.'};}
}
