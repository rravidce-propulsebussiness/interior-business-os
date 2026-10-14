import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type ConstructionSpecSection = {
  title: string;
  kind?: 'plans' | 'material' | 'general';
  deliverables?: string[];
  customFields?: { label: string; value: string }[];
  brand: string;
  grade: string;
  description: string;
  allowancePerSqft: string;
};
export type ConstructionPackage = {
  themeColor: string;
  specSections: ConstructionSpecSection[];
  attachmentFilename: string | null;
  id: string;
  name: string;
  code: string;
  description: string;
  ratePerSqft: string;
  status: 'active' | 'inactive';
  version: number;
};
export type PackageSpecification = {
  id: string;
  category: string;
  name: string;
  specification: string;
  version: number;
};
export type ConstructionPackagePreview = {
  packageId: string;
  packageName: string;
  packageCode: string;
  description: string;
  ratePerSqft: string;
  areaSqft: string;
  total: string;
  options: PackageSpecification[];
};

export function createConstructionPackagesRepository(
  client: SupabaseClient<Database>,
) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  async function invoke<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await rpc(name, args);
    if (error)
      throw new DomainError(
        error.code === '42501'
          ? 'FORBIDDEN'
          : error.code === '40001' || error.code === '23505'
            ? 'CONFLICT'
            : ['22023', '22P02', '23514'].includes(error.code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    return data as T;
  }
  return {
    list: (org: string) =>
      invoke<ConstructionPackage[]>('construction_package_list', {
        p_org: org,
      }),
    save: (
      org: string,
      input: {
        id?: string | undefined;
        version?: number | undefined;
        name: string;
        code: string;
        description: string;
        ratePerSqft: string;
        status: 'active' | 'inactive';
        themeColor: string;
        specSections: ConstructionSpecSection[];
      },
    ) =>
      invoke<string>('construction_package_save', {
        p_org: org,
        p_input: input,
      }),
    preview: (
      org: string,
      packageId: string,
      ids: string[],
      areaSqft: string,
    ) =>
      invoke<ConstructionPackagePreview>('construction_package_quote_preview', {
        p_org: org,
        p_package_id: packageId,
        p_ids: ids,
        p_area: areaSqft,
      }),
  };
}
