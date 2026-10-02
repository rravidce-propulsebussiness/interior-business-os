import type { TenantAccessContext } from '@business-os/core';

export interface AccessRequest {
  readonly organizationId: string;
  readonly branchId?: string;
  readonly permission: string;
  readonly moduleKey?: string;
}

/** Pure policy only: caller must load current, trusted membership and grants server-side. */
export function canAccess(
  context: TenantAccessContext | null,
  request: AccessRequest,
): boolean {
  if (
    !context ||
    !context.userId ||
    !context.organizationId ||
    !request.permission ||
    context.membershipStatus !== 'active' ||
    context.organizationId !== request.organizationId
  )
    return false;
  if (
    request.moduleKey !== undefined &&
    (!request.moduleKey || !context.entitlements.includes(request.moduleKey))
  )
    return false;
  return context.grants.some(
    (grant) =>
      grant.permission === request.permission &&
      (grant.scope.kind === 'organization' ||
        (request.branchId !== undefined &&
          grant.scope.branchId === request.branchId)),
  );
}

export function moduleNavigation(
  context: TenantAccessContext,
  modules: readonly {
    key: string;
    name: string;
    required_permission: string;
    status: string;
  }[],
) {
  return modules
    .filter(
      (module) =>
        module.status === 'active' &&
        canAccess(context, {
          organizationId: context.organizationId,
          permission: module.required_permission,
          moduleKey: module.key,
        }),
    )
    .map((module) => ({
      key: module.key,
      label: module.name,
      href: `/dashboard/modules/${encodeURIComponent(module.key)}`,
    }));
}
