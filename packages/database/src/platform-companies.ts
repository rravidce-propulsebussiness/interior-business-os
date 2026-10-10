import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type PlatformUserCompany = {
  id: string;
  name: string;
  slug: string;
  status: string;
  membershipId: string;
  memberStatus: string;
  isOwner: boolean;
  roles: string[];
  sellerStatus: CompanySeller['status'] | null;
  industries: string[];
};
export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  status: 'active' | 'pending' | 'suspended';
  kind: 'business_owner' | 'seller' | 'general_user';
  verified: boolean;
  createdAt: string;
  companies: PlatformUserCompany[];
};
export type PlatformUserDirectory = {
  rows: PlatformUser[];
  total: number;
  page: number;
  stats: {
    organizations: number;
    businessOwners: number;
    sellers: number;
    generalUsers: number;
    activeUsers: number;
    totalUsers: number;
  };
};

export type CompanyIndustry = { id: string; key: string; name: string };
export type CompanySeller = {
  id: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
};
export type CompanyRole = {
  id: string;
  key: string;
  name: string;
  isOwner: boolean;
};
export type CompanyMember = {
  id: string;
  email: string;
  status: string;
  roleIds: string[];
};
export type PlatformCompany = {
  id: string;
  name: string;
  slug: string;
  status: string;
  planId: string | null;
  country: string;
  createdAt: string;
  sellerId: string | null;
  sellerName: string | null;
  sellerStatus: CompanySeller['status'] | null;
  industries: CompanyIndustry[];
  memberCount: number;
};
export type CompanyDirectory = {
  rows: PlatformCompany[];
  total: number;
  page: number;
};
export type CompanyProfile = {
  ownerEmail: string;
  industries: CompanyIndustry[];
  seller: CompanySeller | null;
  roles: CompanyRole[];
  members: CompanyMember[];
};
export type CreateCompanyInput = {
  name: string;
  slug: string;
  legalName?: string;
  ownerEmail: string;
  country: string;
  currency: string;
  timezone: string;
  planId?: string;
  industries: string[];
  seller: boolean;
  storeName?: string;
};

export function createPlatformCompaniesRepository(
  client: SupabaseClient<Database>,
) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;

  async function invoke<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await rpc(name, args);
    if (error) {
      const code = error.code;
      throw new DomainError(
        code === '42501'
          ? 'FORBIDDEN'
          : code === '23505'
            ? 'CONFLICT'
            : ['22023', '22P02', '23514', '23503'].includes(code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    }
    if (data === null || data === undefined) throw new DomainError('NOT_FOUND');
    return data as T;
  }

  return {
    directory: (filters: {
      query?: string;
      status?: string;
      industryId?: string;
      kind?: string;
      page: number;
    }) =>
      invoke<CompanyDirectory>('platform_company_directory', {
        p_query: filters.query ?? null,
        p_status: filters.status ?? null,
        p_industry_id: filters.industryId ?? null,
        p_kind: filters.kind ?? 'all',
        p_page: filters.page,
      }),
    profile: (organizationId: string) =>
      invoke<CompanyProfile>('platform_company_profile', {
        p_organization_id: organizationId,
      }),
    ownerDirectory: (filters: {
      query?: string;
      kind?: string;
      status?: string;
      industryId?: string;
      sort?: string;
      page: number;
    }) =>
      invoke<PlatformUserDirectory>('platform_owner_directory', {
        p_query: filters.query ?? '',
        p_kind: filters.kind ?? 'all',
        p_status: filters.status ?? '',
        p_industry_id: filters.industryId ?? null,
        p_page: filters.page,
        p_sort: filters.sort ?? 'newest',
      }),
    ownerEmailStatus: (email: string) =>
      invoke<'verified' | 'unverified' | 'suspended' | 'missing'>(
        'platform_owner_email_status',
        { p_email: email },
      ),
    userDirectory: (filters: {
      query?: string;
      kind?: string;
      status?: string;
      industryId?: string;
      sort?: string;
      page: number;
    }) =>
      invoke<PlatformUserDirectory>('platform_user_directory', {
        p_query: filters.query ?? '',
        p_kind: filters.kind ?? 'all',
        p_status: filters.status ?? '',
        p_industry_id: filters.industryId ?? null,
        p_page: filters.page,
        p_sort: filters.sort ?? 'newest',
      }),
    userProfile: (id: string) =>
      invoke<PlatformUser>('platform_user_profile', { p_user_id: id }),
    userCompanyChoices: () =>
      invoke<
        Array<{
          organizationId: string;
          organizationName: string;
          roles: Array<{ id: string; name: string }>;
        }>
      >('platform_user_company_choices', {}),
    setUserStatus: (id: string, status: 'active' | 'suspended') =>
      invoke<void>('platform_user_status_set', {
        p_user_id: id,
        p_status: status,
      }),
    assignUserToCompany: (
      userId: string,
      organizationId: string,
      roleId: string,
    ) =>
      invoke<string>('platform_user_company_assign', {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_role_id: roleId,
      }),

    create: (input: CreateCompanyInput) =>
      invoke<{ organizationId: string; sellerId: string | null }>(
        'platform_company_create',
        { p_input: input },
      ),
    enableSeller: (organizationId: string, storeName: string) =>
      invoke<string>('platform_company_seller_enable', {
        p_organization_id: organizationId,
        p_store_name: storeName,
      }),
    setIndustry: (
      organizationId: string,
      industryId: string,
      enabled: boolean,
    ) =>
      invoke<void>('platform_company_industry_set', {
        p_organization_id: organizationId,
        p_industry_id: industryId,
        p_enabled: enabled,
      }),
    setRole: (
      organizationId: string,
      membershipId: string,
      roleId: string,
      remove: boolean,
    ) =>
      invoke<void>('platform_company_role_set', {
        p_organization_id: organizationId,
        p_membership_id: membershipId,
        p_role_id: roleId,
        p_remove: remove,
      }),
  };
}
