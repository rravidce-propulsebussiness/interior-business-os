import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type GstTemplateKind = 'sales_invoice' | 'purchase_bill';
export type GstTemplateConfig = {
  layout: 'modern' | 'classic' | 'minimal';
  accent: string;
  subtitle: string;
  footer: string;
  showUnit: boolean;
  showDiscount: boolean;
  blankRows: number;
  customFields: { label: string; value: string }[];
};
export type GstInvoiceTemplate = {
  id: string;
  name: string;
  kind: GstTemplateKind;
  status: 'active' | 'inactive';
  config: GstTemplateConfig;
};
export type GstInvoiceAppearance = {
  templateId: string | null;
  name: string;
  config: GstTemplateConfig;
};

export type GstFilingLine = {
  description: string;
  hsnSac: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export type GstFilingDocument = {
  number: string;
  kind: GstTemplateKind;
  documentType: 'tax_invoice' | 'bill_of_supply' | 'commercial_invoice';
  date: string;
  placeOfSupply: string;
  partyName: string;
  partyGstin: string | null;
  partyState: string;
  supplierName: string;
  supplierGstin: string | null;
  reverseCharge: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount: number;
  total: number;
  lines: GstFilingLine[];
};

export function createGstTemplatesRepository(client: SupabaseClient<Database>) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;

  async function invoke<T>(name: string, args: Record<string, unknown>) {
    const { data, error } = await rpc(name, args);
    if (error) {
      throw new DomainError(
        error.code === '42501'
          ? 'FORBIDDEN'
          : error.code === '23505'
            ? 'CONFLICT'
            : ['22023', '22P02', '23514', '23503'].includes(error.code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    }
    return data as T;
  }

  return {
    platformList: () =>
      invoke<GstInvoiceTemplate[]>('gst_template_list', { p_org: null }),
    tenantList: (organizationId: string) =>
      invoke<GstInvoiceTemplate[]>('gst_template_list', {
        p_org: organizationId,
      }),
    standard: (organizationId: string | null = null) =>
      invoke<GstInvoiceAppearance>('gst_standard_invoice_format', {
        p_org: organizationId,
      }),
    setStandard: (templateId: string) =>
      invoke<void>('gst_standard_invoice_select', {
        p_template_id: templateId,
      }),
    selectCompany: (organizationId: string, templateId: string, style?: Partial<GstTemplateConfig>) =>
      invoke<void>('gst_company_template_select', {
        p_org: organizationId,
        p_template_id: templateId,
        p_style: style ?? null,
      }),
    filingRows: (
      organizationId: string,
      from: string,
      to: string,
      kind: GstTemplateKind,
    ) =>
      invoke<GstFilingDocument[]>('gst_filing_workpaper', {
        p_org: organizationId,
        p_from: from,
        p_to: to,
        p_kind: kind,
      }),
    save: (input: {
      id?: string;
      name: string;
      kind: GstTemplateKind;
      config: GstTemplateConfig;
    }) => invoke<string>('gst_template_save', { p_input: input }),
    setStatus: (id: string, active: boolean) =>
      invoke<void>('gst_template_set_status', {
        p_id: id,
        p_active: active,
      }),
    saveDocument: (
      organizationId: string,
      input: unknown,
      templateId: string | null,
    ) =>
      invoke<string>('gst_document_with_template_save', {
        p_org: organizationId,
        p_input: input,
        p_template_id: templateId,
      }),
    documentLayout: (organizationId: string, documentId: string) =>
      invoke<GstInvoiceAppearance | null>('gst_document_layout', {
        p_org: organizationId,
        p_id: documentId,
      }),
  };
}
