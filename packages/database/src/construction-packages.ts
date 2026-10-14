import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type ConstructionSpecSection = {
  title: string;
  kind?: 'plans' | 'material' | 'general' | undefined;
  deliverables?: string[] | undefined;
  customFields?: { label: string; value: string }[] | undefined;
  brand: string;
  grade: string;
  description: string;
  allowancePerSqft: string;
};
/** Normalize earlier package rows without changing stored company data.
 * A previous release stored drawing selections as {label,included} and
 * added named fields under "fields". New editors consume a common format. */
export function normalizeConstructionSpecSection(
  raw: ConstructionSpecSection,
): ConstructionSpecSection {
  const legacy = raw as unknown as {
    kind?: 'plans' | 'material' | 'custom' | 'general';
    deliverables?: Array<string | { label: string; included: boolean }>;
    fields?: { label: string; value: string }[];
  };
  return {
    ...raw,
    kind: legacy.kind === 'custom' ? 'general' : legacy.kind,
    deliverables: (legacy.deliverables ?? []).flatMap((item) =>
      typeof item === 'string' ? [item] : item.included ? [item.label] : [],
    ),
    customFields: raw.customFields ?? legacy.fields ?? [],
  };
}
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
    list: async (org: string) => {
      const packages = await invoke<ConstructionPackage[]>(
        'construction_package_list', { p_org: org },
      );
      return packages.map((item) => ({
        ...item,
        specSections: item.specSections.map(normalizeConstructionSpecSection),
      }));
    },
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
