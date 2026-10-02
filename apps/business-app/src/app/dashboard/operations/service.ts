import 'server-only';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { operationsModules } from '@business-os/core/operations';
import { createOperationsRepository } from '@business-os/database/operations';
import { DomainError } from '@business-os/shared';
export async function operationsServices(permission: string, page = false) {
  const s = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  await s.authorization.requirePermission(context.organizationId, permission, {
    moduleKey: 'projects',
  });
  for (const moduleKey of operationsModules(permission).slice(1))
    await s.authorization.requireEntitlement(context.organizationId, moduleKey);
  const allowed = (p: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission: p,
      moduleKey: 'projects',
    }) && operationsModules(p).every((m) => context.entitlements.includes(m));
  return {
    ...s,
    context,
    allowed,
    operations: createOperationsRepository(s.client, context.organizationId),
  };
}
