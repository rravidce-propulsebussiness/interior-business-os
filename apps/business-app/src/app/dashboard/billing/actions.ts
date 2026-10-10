'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { createGstRepository, type GstDocumentInput } from '@business-os/database/gst';
import { idSchema, safeFailure, DomainError } from '@business-os/shared';

type State={message:string};
const gstin=z.union([
  z.literal(''),
  z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/),
]);
const profileSchema=z.object({
  legalName:z.string().trim().min(2).max(200),
  address:z.string().trim().min(5).max(1000),
  stateCode:z.string().regex(/^[0-9]{2}$/),
  gstin,
  authorizedSignatory:z.string().trim().max(150),
});
const rateString=z.coerce.number().finite().nonnegative().max(100000000);
const invoiceLine=z.object({
  description:z.string().trim().min(2).max(500),
  hsnSac:z.string().trim().min(2).max(12),
  unit:z.string().trim().min(1).max(24),
  quantity:z.coerce.number().positive().max(1000000),
  unitPrice:rateString,
  discount:rateString,
  gstRate:z.coerce.number().nonnegative().max(40),
}).strict();
const invoiceInput=z.object({
  id:z.uuid().optional(),
  version:z.number().int().positive().optional(),
  kind:z.enum(['sales_invoice','purchase_bill']),
  number:z.string().max(40).optional(),
  documentType:z.enum(['tax_invoice','bill_of_supply','commercial_invoice']),
  date:z.iso.date(),
  dueDate:z.union([z.iso.date(),z.null()]),
  partyName:z.string().trim().min(2).max(200),
  partyAddress:z.string().max(1000),
  partyGstin:gstin,
  partyState:z.string().regex(/^[0-9]{2}$/),
  placeOfSupply:z.string().regex(/^[0-9]{2}$/),
  deliveryAddress:z.string().max(1000),
  reverseCharge:z.boolean(),
  notes:z.string().max(2000),
  lines:z.array(invoiceLine).min(1).max(50),
  marketplaceOrderId:z.uuid().optional(),
}).strict();

async function workspace() {
  const context=await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  const services=await serverServices();
  return { org: context.organizationId, ...services };
}
export async function saveGstProfile(_state:State,form:FormData) {
  try {
    const {org,authorization,client}=await workspace();
    await authorization.requirePermission(org,'billing.manage');
    const input=profileSchema.parse({
      legalName:form.get('legalName'),address:form.get('address'),
      stateCode:form.get('stateCode'),gstin:String(form.get('gstin')??'').trim().toUpperCase(),
      authorizedSignatory:form.get('authorizedSignatory')??'',
    });
    if (input.gstin && !input.gstin.startsWith(input.stateCode)) return {message:'GSTIN must match your registration state.'};
    await createGstRepository(client).saveProfile(org,{...input,gstin:input.gstin||null});
    revalidatePath('/dashboard/billing');
    return {message:'Billing profile saved. Review details before issuing tax invoices.'};
  } catch(error) {return {message:safeFailure(error).message};}
}
export async function saveGstDocument(form:FormData) {
  const path='/dashboard/billing/new';
  let id:string;
  try {
    const {org,authorization,client}=await workspace();
    await authorization.requirePermission(org,'invoice.create');
    const existingId=String(form.get('id')??'').trim();
    const marketplaceOrderId=String(form.get('marketplaceOrderId')??'').trim();
    const linesText=String(form.get('linesJson')??'');
    if(linesText.length>60000) throw new DomainError('VALIDATION_FAILED');
    const parsed=invoiceInput.parse({
      ...(existingId?{id:existingId,version:Number(form.get('version'))}:{}),
      kind:form.get('kind'),
      ...(String(form.get('number')??'').trim()?{number:String(form.get('number')).trim()}:{}),
      documentType:form.get('documentType'),
      date:form.get('date'),
      dueDate:String(form.get('dueDate')??'')||null,
      partyName:form.get('partyName'),
      partyAddress:form.get('partyAddress')??'',
      partyGstin:String(form.get('partyGstin')??'').trim().toUpperCase(),
      partyState:form.get('partyState'),
      placeOfSupply:form.get('placeOfSupply'),
      deliveryAddress:form.get('deliveryAddress')??'',
      reverseCharge:form.get('reverseCharge')==='true',
      notes:form.get('notes')??'',
      lines:JSON.parse(linesText) as unknown,
      ...(marketplaceOrderId?{marketplaceOrderId}:{}),
    });
    const input=parsed as GstDocumentInput;
    id=await createGstRepository(client).saveDocument(org,input);
    revalidatePath('/dashboard/billing');
  }catch(error) {
    redirect(path+'?error='+encodeURIComponent(safeFailure(error).message));
  }
  redirect('/dashboard/billing/'+id+'?saved=1');
}
export async function finalizeGstDocument(_state:State,form:FormData) {
  try {
    const {org,authorization,client}=await workspace();
    await authorization.requirePermission(org,'invoice.issue');
    const id=idSchema.parse(form.get('id'));
    const version=z.coerce.number().int().positive().parse(form.get('version'));
    await createGstRepository(client).finalize(org,id,version);
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard/billing/'+id);
    return {message:'Document finalized and locked. Refresh to view the issued copy.'};
  }catch(error){return {message:safeFailure(error).message};}
}
