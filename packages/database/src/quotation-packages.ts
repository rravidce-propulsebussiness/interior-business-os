import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type QuotationPackage = {
  id: string;
  industryKey: string;
  name: string;
  code: string;
  description: string;
  pricingBasis: 'fixed' | 'per_sqft' | 'per_bhk' | 'per_unit';
  basePrice: string;
  currency: string;
  status: 'active' | 'inactive';
  version: number;
};

export function createQuotationPackagesRepository(
  client: SupabaseClient<Database>,
) {
  // The RPCs arrive in the next migration; cast until database types are regenerated.
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  async function invoke<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await rpc(name, args);
    if (error) {
      throw new DomainError(
        error.code === '42501'
          ? 'FORBIDDEN'
          : error.code === '23505' || error.code === '40001'
            ? 'CONFLICT'
            : ['22023', '22P02', '23514'].includes(error.code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    }
    return data as T;
  }
  return {
    list: (org: string) =>
      invoke<QuotationPackage[]>('quotation_package_list', { p_org: org }),
    save: (
      org: string,
      input: Omit<QuotationPackage, 'id' | 'version'> & {
        id?: string | undefined;
        version?: number | undefined;
      },
    ) =>
      invoke<string>('quotation_package_save', { p_org: org, p_input: input }),
  };
}
