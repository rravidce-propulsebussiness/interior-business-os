import { z } from 'zod';
import { activeOrganization,serverServices } from '@business-os/auth/server';
import { stagePaymentRequestPdf } from '../../../../../stage-payment-request-pdf';

export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!z.uuid().safeParse(id).success)return new Response('Not found',{status:404});
 const org=await activeOrganization();
 if(!org)return new Response('Unauthorized',{status:401});
 try{
  const {authorization,client}=await serverServices();
  await authorization.requirePermission(
   org.organizationId,'payment_request.view');
  const {data,error}=await client.from('payment_requests')
   .select('document_snapshot,status').eq('organization_id',org.organizationId)
   .eq('id',id).maybeSingle();
  if(error||!data||data.status!=='issued')
   return new Response('Not found',{status:404});
  const bytes=await stagePaymentRequestPdf(data.document_snapshot);
  return new Response(new Uint8Array(bytes),{
   headers:{'Content-Type':'application/pdf',
    'Content-Disposition':'attachment; filename="stage-payment-request.pdf"',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
   },
  });
 }catch{return new Response('PDF unavailable',{status:503});}
}
