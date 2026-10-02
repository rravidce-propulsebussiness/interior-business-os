import 'server-only';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { createFinanceRepository } from '@business-os/database/finance';
import { DomainError } from '@business-os/shared';
export async function financeServices(permission: string, page = false) {
  const s = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  await s.authorization.requirePermission(context.organizationId, permission, {
    moduleKey: 'billing',
  });
  if (
    permission.startsWith('contract.') ||
    permission.startsWith('change_order.')
  )
    await s.authorization.requireEntitlement(
      context.organizationId,
      'projects',
    );
  const allowed = (permission: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      moduleKey: 'billing',
    }) &&
    ((!permission.startsWith('contract.') &&
      !permission.startsWith('change_order.')) ||
      context.entitlements.includes('projects'));
  return {
    ...s,
    context,
    org: context.organizationId,
    allowed,
    finance: createFinanceRepository(s.client, context.organizationId),
  };
}
