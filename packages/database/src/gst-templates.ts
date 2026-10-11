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
      invoke<GstInvoiceTemplate[]>('gst_template_list', { p_org: organizationId }),
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
      input: Record<string, unknown>,
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
