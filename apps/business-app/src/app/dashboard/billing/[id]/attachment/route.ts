import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createGstRepository } from '@business-os/database/gst';
import { idSchema } from '@business-os/shared';
import { readSupplierBillAttachment } from '../../supplier-bill-storage';

export const dynamic = 'force-dynamic';
export async function GET(
  _request:Request,{params}:{params:Promise<{id:string}>},
) {
  const {id}=await params;
  if (!idSchema.safeParse(id).success) return new Response('Not found',{status:404});
  const {client,authorization}=await pageServices();
  const ctx=await activeOrganization();
  if(!ctx) return new Response('Not found',{status:404});
  await authorization.requirePermission(ctx.organizationId,'invoice.view');
  const document=await createGstRepository(client).document(ctx.organizationId,id);
  if(!document.isOwner || document.kind!=='purchase_bill') return new Response('Not found',{status:404});
  const file=await readSupplierBillAttachment(ctx.organizationId,id);
  if(!file)return new Response('No attachment',{status:404});
  return new Response(file,{headers:{
    'Content-Type':file.type||'application/octet-stream',
    'Content-Disposition':'attachment; filename="supplier-bill"',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }});
}
