import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import { stagePaymentRequestPdf } from '../../../../stage-payment-request-pdf';

export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const project=new URL(request.url).searchParams.get('project')??'';
 if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(project).success)
  return new Response('Not found',{status:404});
 const db=await createServerDatabase();
 const {data:auth}=await db.auth.getUser();
 if(!auth.user)return new Response('Unauthorized',{status:401});
 const result=await db.rpc('client_portal_stage_request_read',{
  p_project_id:project,p_request_id:id,
 });
 if(result.error||!result.data)return new Response('Not found',{status:404});
 try{
  const bytes=await stagePaymentRequestPdf(result.data);
  return new Response(new Uint8Array(bytes),{
   headers:{'Content-Type':'application/pdf',
    'Content-Disposition':'attachment; filename="stage-payment-request.pdf"',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
   },
  });
 }catch{return new Response('PDF unavailable',{status:503});}
}
