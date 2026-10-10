import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type GstBusinessProfile = {
  legalName: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  authorizedSignatory: string;
};
export type GstLine = {
  description: string;
  hsnSac: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  taxable?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total?: number;
};
export type GstDocumentInput = {
  id?: string;
  version?: number;
  kind: 'sales_invoice' | 'purchase_bill';
  number?: string;
  documentType: 'tax_invoice' | 'bill_of_supply' | 'commercial_invoice';
  date: string;
  dueDate: string | null;
  partyName: string;
  partyAddress: string;
  partyGstin: string;
  partyState: string;
  placeOfSupply: string;
  deliveryAddress: string;
  reverseCharge: boolean;
  notes: string;
  lines: GstLine[];
  marketplaceOrderId?: string;
};
export type GstDocumentRow = {
  id: string;
  organizationId: string;
  kind: 'sales_invoice' | 'purchase_bill';
  status: 'draft' | 'issued' | 'recorded';
  number: string | null;
  date: string;
  partyName: string;
  total: number;
  version: number;
  cgst: number;
  sgst: number;
  igst: number;
  createdAt: string;
};
export type GstDocument = Omit<GstDocumentInput, 'partyGstin'> & {
  id: string;
  status: GstDocumentRow['status'];
  partyGstin: string | null;
  number: string | null;
  version: number;
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  isOwner: boolean;
  snapshot: Record<string, unknown> | null;
};
export type GstSummary = {
  organizations: number;
  configured: number;
  gstRegistered: number;
  issuedInvoices: number;
  purchaseBills: number;
};

export function createGstRepository(client: SupabaseClient<Database>) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  async function invoke<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const result = await rpc(name, args);
    if (result.error) {
      const code = result.error.code;
      throw new DomainError(
        code === '42501'
          ? 'FORBIDDEN'
          : code === '23505' || code === '40001'
            ? 'CONFLICT'
            : ['22023', '22P02', '23514', '23503'].includes(code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    }
    return result.data as T;
  }
  return {
    profile: (organizationId: string) =>
      invoke<GstBusinessProfile | null>('gst_profile_read', {
        p_org: organizationId,
      }),
    saveProfile: (organizationId: string, input: GstBusinessProfile) =>
      invoke<void>('gst_profile_save', {
        p_org: organizationId,
        p_input: input,
      }),
    saveDocument: (organizationId: string, input: GstDocumentInput) =>
      invoke<string>('gst_document_save', {
        p_org: organizationId,
        p_input: input,
      }),
    finalize: (organizationId: string, id: string, version: number) =>
      invoke<string>('gst_document_finalize', {
        p_org: organizationId,
        p_id: id,
        p_version: version,
      }),
    list: (
      organizationId: string,
      kind: 'all' | 'sales_invoice' | 'purchase_bill' | 'incoming',
    ) =>
      invoke<GstDocumentRow[]>('gst_documents', {
        p_org: organizationId,
        p_kind: kind,
      }),
    document: (organizationId: string, id: string) =>
      invoke<GstDocument>('gst_document', { p_org: organizationId, p_id: id }),
    platformSummary: () => invoke<GstSummary>('platform_gst_summary', {}),
  };
}
