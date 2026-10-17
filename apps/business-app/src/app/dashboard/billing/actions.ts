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
    await authorization.requirePermission(org, 'invoice.create');
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
    if (stageRequested) {
      const checkedLead = idSchema.parse(leadId);
      const checkedRevision = idSchema.parse(revisionId);
      const checkedStage = z.coerce.number().int().min(1).max(40).parse(stageNumber);
      if (input.kind !== 'sales_invoice') throw new DomainError('VALIDATION_FAILED');
      id = await createGstRepository(client).saveStageDocument(
        org, input, checkedLead, checkedRevision, checkedStage,
      );
    } else if (input.kind === 'sales_invoice' && !marketplaceOrderId && wonLeadId) {
      id = await createGstRepository(client).saveWonLeadDocument(
        org, input, idSchema.parse(wonLeadId),
      );
    } else if (input.kind === 'sales_invoice' && !marketplaceOrderId) {
      id = await createGstRepository(client).saveCustomerDocument(
        org, input, customerId ? idSchema.parse(customerId) : null,
      );
    } else {
      if (customerId || wonLeadId) throw new DomainError('VALIDATION_FAILED');
      // Supplier and marketplace bills continue through their original path.
      id = await createGstTemplatesRepository(client).saveDocument(org, input, null);
    }
    // The GST bill is canonical. A failed attachment does not duplicate it.
    if (input.kind === 'purchase_bill' && supplierFile) {
      try { await saveSupplierBillAttachment(org, id, supplierFile); }
      catch { attachmentWarning = true; }
    }
    revalidatePath('/dashboard/billing');
    revalidatePath('/dashboard/finance');
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
