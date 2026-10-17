'use server';

import { revalidatePath } from 'next/cache';
import { idSchema, safeFailure } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

/** A Final badge selects one customer's quote; it never issues, accepts or edits the PDF. */
export async function markQuotationFinal(quotationId: string):
  Promise<{ok:boolean;message:string}> {
  try {
    const id=idSchema.parse(quotationId);
    const s=await commercialServices('quotation.edit','quotation');
    const {data,error}=await s.client.rpc('quotation_mark_final',{
      p_org:s.org,p_quotation:id,
    });
    if(error || data!==true){
      return {ok:false,message:error?.message ?? 'Could not select the final quotation.'};
    }
    revalidatePath('/dashboard/quotations');
    revalidatePath('/dashboard/crm/leads');
    return {ok:true,message:'Quotation marked Final.'};
  }catch(error){
    return {ok:false,message:safeFailure(error).message};
  }
}
