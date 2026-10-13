import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DomainError,
  idSchema,
  organizationInputSchema,
  entitlementInputSchema,
  organizationUpdateSchema,
  branchInputSchema,
  membershipInputSchema,
  employeeEmailInvitationSchema,
  membershipStatusSchema,
  roleAssignmentSchema,
  roleInputSchema,
  platformRoleInputSchema,
} from '@business-os/shared';
import type { Database } from './generated/database.types';

function unwrap<T>({
  data,
  error,
}: {
  data: T;
  error: { code?: string } | null;
}): NonNullable<T> {
  if (error)
    throw new DomainError(
      error.code === '42501'
        ? 'FORBIDDEN'
        : error.code === '23505'
          ? 'CONFLICT'
          : ['22023', '23514', '22P02', '23503'].includes(error.code ?? '')
            ? 'VALIDATION_FAILED'
            : 'INTERNAL_ERROR',
    );
  if (data === null || data === undefined) throw new DomainError('NOT_FOUND');
  return data;
}
export function createRepository(client: SupabaseClient<Database>) {
  return {
    async user() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email };
    },
    async context(id: string) {
      return unwrap(
        await client.rpc('organization_context', {
          p_organization_id: idSchema.parse(id),
        }),
      );
    },
    async platformContext() {
      return unwrap(await client.rpc('platform_context'));
    },
    async hasEntitlement(id: string, key: string) {
      return unwrap(
        await client.rpc('has_entitlement', {
          p_organization_id: idSchema.parse(id),
          p_module_key: entitlementInputSchema.shape.moduleKey.parse(key),
        }),
      );
    },
    async organizations() {
      return unwrap(
        await client.from('organizations').select('*').order('name'),
      );
    },
    async organizationDirectory(filters: {
      query?: string;
      status?: 'active' | 'trial' | 'suspended' | 'archived';
      page: number;
      pageSize: number;
    }) {
      const page = Math.max(1, Math.min(10_000, Math.trunc(filters.page)));
      const pageSize = Math.max(1, Math.min(50, Math.trunc(filters.pageSize)));
      let request = client
        .from('organizations')
        .select('id,name,slug,status,plan_id,country_code,created_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (filters.status) request = request.eq('status', filters.status);
      const search = filters.query
        ?.trim()
        .replace(/[\\%_]/g, '')
        .slice(0, 80);
      if (search) request = request.ilike('name', `%${search}%`);
      const response = await request.range(
        (page - 1) * pageSize,
        page * pageSize - 1,
      );
      return {
        organizations: unwrap(response),
        total: response.count ?? 0,
        page,
        pageSize,
      };
    },
    async organization(id: string) {
      return unwrap(
        await client
          .from('organizations')
          .select('*')
          .eq('id', idSchema.parse(id))
          .maybeSingle(),
      );
    },
    async memberships() {
      return unwrap(await client.from('organization_memberships').select('*'));
    },
    async branches(id: string) {
      return unwrap(
        await client
          .from('branches')
          .select('*')
          .eq('organization_id', idSchema.parse(id))
          .order('name'),
      );
    },
    async team(id: string) {
      return unwrap(
        await client
          .from('organization_memberships')
          .select('*')
          .eq('organization_id', idSchema.parse(id))
          .order('created_at'),
      );
    },
    async modules() {
      return unwrap(await client.from('modules').select('*').order('name'));
    },
    async plans() {
      return unwrap(await client.from('plans').select('*').order('name'));
    },
    async planModules() {
      return unwrap(await client.from('plan_modules').select('*'));
    },
    async industries() {
      return unwrap(
        await client
          .from('industries')
          .select('*')
          .eq('status', 'active')
          .order('name'),
      );
    },
    async entitlements(id: string) {
      return unwrap(
        await client
          .from('organization_entitlements')
          .select('*')
          .eq('organization_id', idSchema.parse(id)),
      );
    },
    async createSubscriptionPlan(input: {
      key: string;
      name: string;
      modules: string[];
    }) {
      return unwrap(
        await client.rpc('platform_plan_create', { p_input: input }),
      );
    },
    async submitCompanyApplication(input: {
      name: string;
      slug: string;
      legalName: string;
      country: string;
      currency: string;
      timezone: string;
      industries: string[];
      planId?: string;
    }) {
      return unwrap(
        await client.rpc('company_application_submit', { p_input: input }),
      );
    },
    async myCompanyApplications() {
      return unwrap(await client.rpc('company_applications_mine'));
    },
    async companyOnboardingPolicy() {
      return unwrap(await client.rpc('company_onboarding_policy'));
    },
    async setCompanyOnboardingPolicy(approvalRequired: boolean) {
      return unwrap(
        await client.rpc('company_onboarding_set_policy', {
          p_approval_required: approvalRequired,
        }),
      );
    },
    async reviewCompanyApplications(status: string, page: number) {
      return unwrap(
        await client.rpc('company_applications_review', {
          p_status: status,
          p_page: page,
        }),
      );
    },
    async decideCompanyApplication(
      applicationId: string,
      action: 'approve' | 'reject',
      note: string,
    ) {
      return unwrap(
        await client.rpc('company_application_decide', {
          p_application_id: idSchema.parse(applicationId),
          p_action: action,
          p_note: note,
        }),
      );
    },
    async createOrganization(input: unknown) {
      return unwrap(
        await client.rpc('create_organization', {
          p_input: organizationInputSchema.parse(input),
        }),
      );
    },
    async saveBranch(id: string, input: unknown) {
      return unwrap(
        await client.rpc('save_branch', {
          p_organization_id: idSchema.parse(id),
          p_input: branchInputSchema.parse(input),
        }),
      );
    },
    async inviteMember(id: string, input: unknown) {
      const value = membershipInputSchema.parse(input);
      return unwrap(
        await client.rpc('invite_member', {
          p_organization_id: idSchema.parse(id),
          p_user_id: value.userId,
          ...(value.branchId ? { p_branch_id: value.branchId } : {}),
        }),
      );
    },
    async createEmployeeEmailInvitation(orgId: string, input: unknown) {
      const value = employeeEmailInvitationSchema.parse(input);
      return unwrap(
        await client.rpc('employee_invitation_create', {
          p_organization_id: idSchema.parse(orgId),
          p_email: value.email,
          p_role_ids: value.roleIds,
          ...(value.branchId ? { p_branch_id: value.branchId } : {}),
        }),
      );
    },
    async employeeInvitations(orgId: string) {
      const result = await client.rpc('employee_invitations_list', {
        p_organization_id: idSchema.parse(orgId),
      });
      // Hostinger may update application code before the verified DB rollout.
      // Only an undefined RPC means "not installed"; all permission and other
      // failures remain errors and cannot be silently treated as empty access.
      if (['PGRST202', '42883'].includes(result.error?.code ?? ''))
        return { available: false, rows: [] };
      return { available: true, rows: unwrap(result) };
    },
    async myEmployeeInvitations() {
      const result = await client.rpc('employee_invitations_mine');
      if (['PGRST202', '42883'].includes(result.error?.code ?? ''))
        return { available: false, rows: [] };
      return { available: true, rows: unwrap(result) };
    },
    async acceptEmployeeInvitation(id: string) {
      return unwrap(
        await client.rpc('employee_invitation_accept', {
          p_invitation_id: idSchema.parse(id),
        }),
      );
    },
    async revokeEmployeeInvitation(orgId: string, inviteId: string) {
      const result = await client.rpc('employee_invitation_revoke', {
        p_organization_id: idSchema.parse(orgId),
        p_invitation_id: idSchema.parse(inviteId),
      });
      unwrap({ ...result, data: true });
    },
    async resendEmployeeInvitation(orgId: string, inviteId: string) {
      const result = await client.rpc('employee_invitation_resend', {
        p_organization_id: idSchema.parse(orgId),
        p_invitation_id: idSchema.parse(inviteId),
      });
      unwrap({ ...result, data: true });
    },
    async acceptMembership(id: string) {
      const result = await client.rpc('accept_membership', {
        p_membership_id: idSchema.parse(id),
      });
      unwrap({ ...result, data: true });
    },
    async setMembershipStatus(id: string, input: unknown) {
      const value = membershipStatusSchema.parse(input);
      const result = await client.rpc('set_membership_status', {
        p_organization_id: idSchema.parse(id),
        p_membership_id: value.membershipId,
        p_status: value.status,
      });
      unwrap({ ...result, data: true });
    },
    async setMemberRole(id: string, input: unknown) {
      const value = roleAssignmentSchema.parse(input);
      const result = await client.rpc('set_member_role', {
        p_organization_id: idSchema.parse(id),
        p_membership_id: value.membershipId,
        p_role_id: value.roleId,
        p_remove: value.remove,
        ...(value.branchId ? { p_branch_id: value.branchId } : {}),
      });
      unwrap({ ...result, data: true });
    },
    async saveRole(id: string, input: unknown) {
      return unwrap(
        await client.rpc('save_role', {
          p_organization_id: idSchema.parse(id),
          p_input: roleInputSchema.parse(input),
        }),
      );
    },
    async setPlatformRole(input: unknown) {
      const value = platformRoleInputSchema.parse(input);
      const result = await client.rpc('platform_set_role', {
        p_user_id: value.userId,
        p_role_id: value.roleId,
        p_remove: value.remove,
      });
      unwrap({ ...result, data: true });
    },
    async setEntitlement(id: string, input: unknown) {
      return unwrap(
        await client.rpc('platform_set_entitlement', {
          p_organization_id: idSchema.parse(id),
          p_input: entitlementInputSchema.parse(input),
        }),
      );
    },
    async setOrganization(input: unknown) {
      const value = organizationUpdateSchema.parse(input);
      const { error } = await client.rpc('platform_set_organization', {
        p_organization_id: value.organizationId,
        p_status: value.status,
        ...(value.planId ? { p_plan_id: value.planId } : {}),
      });
      if (error)
        throw new DomainError(
          error.code === '42501' ? 'FORBIDDEN' : 'VALIDATION_FAILED',
        );
    },
  };
}
export type Repository = ReturnType<typeof createRepository>;
