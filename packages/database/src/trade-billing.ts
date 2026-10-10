import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';
import { DomainError } from '@business-os/shared';

export type GstParty = {
  name: string;
  address: string;
  gstin: string;
  state: string;
};
export type GstProfile = GstParty & { prefix: string };
export type TradeLine = {
  description: string;
  hsn: string;
  unit: string;
  quantity: number;
  rate: number;
  gstRate: number;
  taxable: number;
  gst: number;
  total: number;
};
export type TradeDocument = {
  id: string;
  kind: 'sales_invoice' | 'purchase_bill';
  status: 'draft' | 'issued' | 'void';
  issueDate: string;
  dueDate: string | null;
  number: string | null;
  reference: string;
  issuer: GstParty;
  receiver: GstParty;
  placeOfSupply: string;
  deliveryAddress: string;
  reverseCharge: boolean;
  lines: TradeLine[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paid: number;
  balance: number;
  notes: string;
  issuedAt: string | null;
  voidReason: string | null;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    mode: string;
    reference: string;
  }>;
};
export type TradeSummary = Pick<
  TradeDocument,
  | 'id'
  | 'kind'
  | 'status'
  | 'total'
  | 'paid'
  | 'balance'
  | 'subtotal'
  | 'cgst'
  | 'sgst'
  | 'igst'
  | 'issueDate'
  | 'dueDate'
> & {
  number: string;
  party: string;
};
export type TradeDraft = {
  id?: string;
  kind: TradeDocument['kind'];
  issueDate: string;
  dueDate: string;
  counterparty: GstParty;
  placeOfSupply: string;
  deliveryAddress: string;
  reverseCharge: boolean;
  lines: Array<
    Pick<
      TradeLine,
      'description' | 'hsn' | 'unit' | 'quantity' | 'rate' | 'gstRate'
    >
  >;
  notes: string;
  reference: string;
};

export function createTradeBillingRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  async function invoke<T>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await rpc(name, { p_org: organizationId, ...args });
    if (error) {
      throw new DomainError(
        error.code === '42501'
          ? 'FORBIDDEN'
          : error.code === '23505'
            ? 'CONFLICT'
            : ['22023', '23514', '22P02', '23503'].includes(error.code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    }
    return data as T;
  }
  return {
    profile: () => invoke<GstProfile | null>('trade_billing_profile'),
    saveProfile: (data: GstProfile) =>
      invoke<void>('trade_billing_profile_save', { p_input: data }),
    list: (kind?: TradeDocument['kind']) =>
      invoke<TradeSummary[]>('trade_documents_list', { p_kind: kind ?? null }),
    document: (id: string) =>
      invoke<TradeDocument>('trade_document_get', { p_id: id }),
    save: (draft: TradeDraft) =>
      invoke<string>('trade_document_save', { p_input: draft }),
    issue: (id: string) => invoke<string>('trade_document_issue', { p_id: id }),
    void: (id: string, reason: string) =>
      invoke<void>('trade_document_void', { p_id: id, p_reason: reason }),
    payment: (
      id: string,
      amount: number,
      date: string,
      mode: string,
      reference: string,
    ) =>
      invoke<string>('trade_payment_record', {
        p_id: id,
        p_amount: amount,
        p_date: date,
        p_mode: mode,
        p_reference: reference,
      }),
  };
}
