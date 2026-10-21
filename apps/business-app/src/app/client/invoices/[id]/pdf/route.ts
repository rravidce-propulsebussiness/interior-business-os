import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import { invoicePdf, type InvoicePdfData } from '../../../../../invoice-pdf';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const project=new URL(request.url).searchParams.get('project')??'';
 if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(project).success)
  return new Response('Not found',{status:404});
 const db=await createServerDatabase();
 const {data:auth}=await db.auth.getUser();
 if(!auth.user)return new Response('Unauthorized',{status:401});
 const rpc=db.rpc as unknown as (name:'client_portal_invoice_read',
  args:{p_project_id:string;p_invoice:string})=>Promise<{data:unknown;error:unknown}>;
 const result=await rpc('client_portal_invoice_read',{
  p_project_id:project,p_invoice:id,
 });
 if(result.error||!result.data||typeof result.data!=='object')
  return new Response('Not found',{status:404});
 const invoice=result.data as InvoicePdfData;
 try{
  const bytes=await invoicePdf(invoice);
  return new Response(new Uint8Array(bytes),{headers:{
   'Content-Type':'application/pdf',
   'Content-Disposition':'attachment; filename="invoice-'+String(invoice.number??'issued').replace(/[^a-z0-9-]/gi,'-')+'.pdf"',
   'Cache-Control':'private, no-store',
   'X-Content-Type-Options':'nosniff',
  }});
 }catch{return new Response('PDF temporarily unavailable',{status:503});}
}