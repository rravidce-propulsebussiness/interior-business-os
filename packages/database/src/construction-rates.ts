import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type ConstructionRate = {
  id: string;
  category: string;
  name: string;
  specification: string;
  ratePerSqft: string;
  unitPrice: string;
  consumptionPerSqft: string;
  priceUnit: string;
  status: 'active' | 'inactive';
  version: number;
};

export type ConstructionQuotePreview = {
  options: ConstructionRate[];
  areaSqft: string;
  ratePerSqft: string;
  total: string;
};

export function createConstructionRatesRepository(
  client: SupabaseClient<Database>,
) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;

  async function invoke<T>(name: string, args: Record<string, unknown>) {
    const { data, error } = await rpc(name, args);
    if (error)
      throw new DomainError(
        error.code === '42501'
          ? 'FORBIDDEN'
          : error.code === '40001'
            ? 'CONFLICT'
            : ['22023', '22P02', '23514'].includes(error.code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    return data as T;
  }
  return {
    list: (org: string) =>
      invoke<ConstructionRate[]>('construction_rate_list', { p_org: org }),
    save: (
      org: string,
      input: {
        id?: string | undefined;
        version?: number | undefined;
        category: string;
        name: string;
        specification: string;
        ratePerSqft: string;
        unitPrice: string;
        consumptionPerSqft: string;
        priceUnit: string;
        status: 'active' | 'inactive';
      },
    ) =>
      invoke<string>('construction_rate_save', { p_org: org, p_input: input }),
    preview: (org: string, ids: string[], areaSqft: string) =>
      invoke<ConstructionQuotePreview>('construction_rate_quote_preview', {
        p_org: org,
        p_ids: ids,
        p_area: areaSqft,
      }),
  };
}
