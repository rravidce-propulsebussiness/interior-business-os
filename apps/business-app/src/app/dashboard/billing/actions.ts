'use server';
import { revalidatePath } from 'next/cache';
import { saveSupplierBillAttachment } from './supplier-bill-storage';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import {
  createGstRepository,
  type GstDocumentInput,
} from '@business-os/database/gst';
import { idSchema, safeFailure, DomainError } from '@business-os/shared';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { invoiceStageChoices } from './stage-choices';

type State = { message: string };
const gstin = z.union([
  z.literal(''),
  z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/),
]);
const profileSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  address: z.string().trim().min(5).max(1000),
  stateCode: z.string().regex(/^[0-9]{2}$/),
  gstin,
  authorizedSignatory: z.string().trim().max(150),
});
const rateString = z.coerce.number().finite().nonnegative().max(100000000);
const invoiceLine = z
  .object({
    description: z.string().trim().min(2).max(500),
    hsnSac: z.string().trim().min(2).max(12),
    unit: z.string().trim().min(1).max(24),
    quantity: z.coerce.number().positive().max(1000000),
    unitPrice: rateString,
    discount: rateString,
    gstRate: z.coerce.number().nonnegative().max(40),
  })
  .strict();
const invoiceInput = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    kind: z.enum(['sales_invoice', 'purchase_bill']),
    number: z.string().max(40).optional(),
    documentType: z.enum([
      'tax_invoice',
      'bill_of_supply',
      'commercial_invoice',
    ]),
    date: z.iso.date(),
    dueDate: z.union([z.iso.date(), z.null()]),
    partyName: z.string().trim().min(2).max(200),
    partyAddress: z.string().max(1000),
    partyGstin: gstin,
    partyState: z.string().regex(/^[0-9]{2}$/),
    placeOfSupply: z.string().regex(/^[0-9]{2}$/),
    deliveryAddress: z.string().max(1000),
    reverseCharge: z.boolean(),
    notes: z.string().max(2000),
    lines: z.array(invoiceLine).min(1).max(50),
    marketplaceOrderId: z.uuid().optional(),
  })
  .strict();

async function workspace() {
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  const services = await serverServices();
  return { org: context.organizationId, ...services };
}
export async function saveGstProfile(_state: State, form: FormData) {
  try {
    const { org, authorization, client } = await workspace();
    await authorization.requirePermission(org, 'billing.manage');
    const input = profileSchema.parse({
      legalName: form.get('legalName'),
      address: form.get('address'),
      stateCode: form.get('stateCode'),
      gstin: String(form.get('gstin') ?? '')
        .trim()
        .toUpperCase(),
      authorizedSignatory: form.get('authorizedSignatory') ?? '',
    });
    if (input.gstin && !input.gstin.startsWith(input.stateCode))
      return { message: 'GSTIN must match your registration state.' };
    await createGstRepository(client).saveProfile(org, {
      ...input,
      gstin: input.gstin || null,
    });
    revalidatePath('/dashboard/billing');
    return {
      message:
        'Billing profile saved. Review details before issuing tax invoices.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function saveGstDocument(form: FormData) {
  const path = '/dashboard/billing/new';
  let id: string;
  let attachmentWarning = false;
  try {
    const { org, authorization, client } = await workspace();
    const access=await authorization.requirePermission(org, 'invoice.create');
    const owner=access.roles.some(role=>role.name.toLowerCase()==='owner');
    const gst=createGstRepository(client);
    const profile=await gst.profile(org);
    const existingId = String(form.get('id') ?? '').trim();
    const marketplaceOrderId = String(
      form.get('marketplaceOrderId') ?? '',
    ).trim();
    const linesText = String(form.get('linesJson') ?? '');
    if (linesText.length > 60000) throw new DomainError('VALIDATION_FAILED');
    const parsed = invoiceInput.parse({
      ...(existingId
        ? { id: existingId, version: Number(form.get('version')) }
        : {}),
      kind: form.get('kind'),
      ...(String(form.get('number') ?? '').trim()
        ? { number: String(form.get('number')).trim() }
        : {}),
      documentType: form.get('documentType'),
      date: form.get('date'),
      dueDate: String(form.get('dueDate') ?? '') || null,
      partyName: form.get('partyName'),
      partyAddress: form.get('partyAddress') ?? '',
      partyGstin: String(form.get('partyGstin') ?? '')
        .trim()
        .toUpperCase(),
      partyState: form.get('partyState'),
      placeOfSupply: form.get('placeOfSupply'),
      deliveryAddress: form.get('deliveryAddress') ?? '',
      reverseCharge: form.get('reverseCharge') === 'true',
      notes: form.get('notes') ?? '',
      lines: JSON.parse(linesText) as unknown,
      ...(marketplaceOrderId ? { marketplaceOrderId } : {}),
    });
    const input = parsed as GstDocumentInput;
    // GST invoice is only valid for a GST-registered supplier; non-GST
    // documents must have a qualifying category, independently validated.
    const reason=String(form.get('nonGstReason')??'');
    if(input.kind==='sales_invoice'){
      if(input.documentType==='tax_invoice'&&!profile?.gstin)
        throw new DomainError('VALIDATION_FAILED');
      if(input.documentType==='bill_of_supply'&&
        (!profile?.gstin||!['exempt','composition'].includes(reason)))
        throw new DomainError('VALIDATION_FAILED');
      if(input.documentType==='commercial_invoice'&&
        (profile?.gstin?reason!=='non_taxable':reason!=='unregistered'))
        throw new DomainError('VALIDATION_FAILED');
      if(input.documentType!=='tax_invoice'&&
        (input.reverseCharge||input.lines.some(line=>line.gstRate!==0)))
        throw new DomainError('VALIDATION_FAILED');
      if(input.documentType!=='tax_invoice'){
        // Keep the classification on the saved document for future audit.
        const nl=String.fromCharCode(10);
        const clean=input.notes.startsWith('Non-GST category: ')
          ?input.notes.substring(input.notes.indexOf(nl)+1):input.notes;
        const memo='Non-GST category: '+reason+nl+clean;
        if(memo.length>3000)throw new DomainError('VALIDATION_FAILED');
        input.notes=memo;
      }
    }

    const attachment = form.get('supplierBillFile');
    const supplierFile = attachment instanceof File && attachment.size > 0 ? attachment : null;
    if (supplierFile && (input.kind !== 'purchase_bill' || supplierFile.size > 8 * 1024 * 1024 ||
        !['application/pdf','image/png','image/jpeg','image/webp'].includes(supplierFile.type)))
      throw new DomainError('VALIDATION_FAILED');
    // Every tenant uses the same platform-admin-approved appearance.
    // The database ignores client-selected template IDs as a second check.
    const leadId = String(form.get('leadId') ?? '').trim();
    const revisionId = String(form.get('revisionId') ?? '').trim();
    const stageNumber = String(form.get('stageNumber') ?? '').trim();
    const stageRequested = Boolean(leadId || revisionId || stageNumber);
    const wonLeadId = String(form.get('wonLeadId') ?? '').trim();
    const customerId = String(form.get('customerId') ?? '').trim();
    // Stage invoices must stay tied to the accepted quote. Ordinary invoices
    // may optionally reference an existing tenant customer without conversion.
    if ((stageRequested && (customerId || wonLeadId)) || (customerId && wonLeadId))
      throw new DomainError('VALIDATION_FAILED');
    if(input.kind==='sales_invoice'){
      // Owner-facing Save is an atomic "save + issue", never a draft.
      // The database commits the saved invoice, original customer/stage link,
      // official invoice number, and issuance together or not at all.
      await authorization.requirePermission(org,'invoice.issue');
      const checkedLead=stageRequested?idSchema.parse(leadId):null;
      const checkedRevision=stageRequested?idSchema.parse(revisionId):null;
      const checkedStage=stageRequested?
        z.coerce.number().int().min(1).max(40).parse(stageNumber):null;
      if(stageRequested){
        const choice=invoiceStageChoices(await gst.stageOptions(org),profile?.stateCode??'36')
          .find(item=>item.leadId===checkedLead&&item.revisionId===checkedRevision);
        const stage=choice?.stages.find(item=>item.number===checkedStage);
        if(!stage||!input.lines.length)throw new DomainError('VALIDATION_FAILED');
        const primary=input.lines[0]!;
        const amount=Math.round((primary.quantity*primary.unitPrice-primary.discount)*100);
        const full=Math.round(stage.amount*100);
        if(!Number.isSafeInteger(amount)||amount<=0||amount>full)
          throw new DomainError('VALIDATION_FAILED');
        if(amount<full&&(form.get('allowPartialStage')!=='true'||!owner))
          throw new DomainError('FORBIDDEN');
      }
      const issued=await client.rpc('gst_sales_invoice_save_and_issue',{
        p_org:org,p_input:input,
        ...(customerId?{p_customer:idSchema.parse(customerId)}:{}),
        ...(wonLeadId?{p_won_lead:idSchema.parse(wonLeadId)}:{}),
        ...(checkedLead?{p_stage_lead:checkedLead}:{}),
        ...(checkedRevision?{p_revision:checkedRevision}:{}),
        ...(checkedStage?{p_stage:checkedStage}:{}),
      });
      if(issued.error||!issued.data){
        throw new Error(issued.error?.message??'Could not issue invoice');
      }
      id=issued.data;
    }else{
      if(stageRequested||customerId||wonLeadId)
        throw new DomainError('VALIDATION_FAILED');
      // Supplier purchase bills retain the existing draft/review workflow.
      id=await createGstTemplatesRepository(client).saveDocument(org,input,null);
    }
    // The GST bill is canonical. A failed attachment does not duplicate it.
    if (input.kind === 'purchase_bill' && supplierFile) {
      try { await saveSupplierBillAttachment(org, id, supplierFile); }
      catch { attachmentWarning = true; }
    }
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard/finance');
    if(input.kind==='sales_invoice')revalidatePath('/client','layout');
  } catch (error) {
    redirect(path + '?error=' + encodeURIComponent(safeFailure(error).message));
  }
  redirect('/dashboard/billing/' + id + (attachmentWarning ? '?attachment=failed' : '?saved=1'));
}
export async function finalizeGstDocument(_state: State, form: FormData) {
  try {
    const { org, authorization, client } = await workspace();
    await authorization.requirePermission(org, 'invoice.issue');
    const id = idSchema.parse(form.get('id'));
    const version = z.coerce
      .number()
      .int()
      .positive()
      .parse(form.get('version'));
    await createGstRepository(client).finalize(org, id, version);
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard/billing/' + id);
    // Stage-linked first invoices activate the existing quotation prospect.
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard/crm/leads');
    revalidatePath('/dashboard/customers');
    return {
      message:
        'Document finalized and locked. Refresh to view the issued copy.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
