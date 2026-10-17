import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';
import { DomainError } from '@business-os/shared';

export type LabourDisbursement = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  payeeName: string;
  workDescription: string;
  workFrom: string;
  workTo: string;
  grossAmount: number;
  deductions: number;
  netAmount: number;
  status: 'pending' | 'paid';
  paymentMethod: 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other' | null;
  paymentReference: string;
  notes: string;
  paidAt: string | null;
  createdAt: string;
};

export type LabourDisbursementInput = {
  projectId: string | null;
  payeeName: string;
  workDescription: string;
  workFrom: string;
  workTo: string;
  grossAmount: string;
  deductions: string;
  notes: string;
};

/** RPCs enforce tenant permission and project membership at the database boundary.
 * The casts only bridge the lagging generated Supabase RPC type definitions. */
export function createLabourDisbursementsRepository(client: SupabaseClient<Database>) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await rpc(name, args);
    if (result.error) {
      const code = result.error.code;
      throw new DomainError(code === '42501' ? 'FORBIDDEN'
        : code === '23505' || code === '40001' ? 'CONFLICT'
        : ['22023','22P02','23503','23514'].includes(code ?? '') ? 'VALIDATION_FAILED'
        : 'INTERNAL_ERROR');
    }
    return result.data as T;
  }
  return {
    list: (organizationId: string, from: string, to: string) =>
      call<LabourDisbursement[]>('labour_disbursements_list', {
        p_org: organizationId, p_from: from, p_to: to,
      }),
    create: (organizationId: string, input: LabourDisbursementInput) =>
      call<string>('labour_disbursement_create', {
        p_org: organizationId, p_input: input,
      }),
    markPaid: (organizationId: string, id: string, method: string, reference: string) =>
      call<void>('labour_disbursement_mark_paid', {
        p_org: organizationId, p_id: id, p_method: method, p_reference: reference,
      }),
  };
}
