import 'server-only';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { executionModules } from '@business-os/core/execution';
import { createExecutionRepository } from '@business-os/database/execution';
import { DomainError } from '@business-os/shared';
export async function executionServices(permission: string, page = false) {
  const s = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  await s.authorization.requirePermission(context.organizationId, permission, {
    moduleKey: 'projects',
  });
  for (const moduleKey of executionModules(permission).slice(1))
    await s.authorization.requireEntitlement(context.organizationId, moduleKey);
  const allowed = (p: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission: p,
      moduleKey: 'projects',
    }) &&
    executionModules(p).every((module) =>
      context.entitlements.includes(module),
    );
  const { data: organization, error } = await s.client
    .from('organizations')
    .select('name,default_currency')
    .eq('id', context.organizationId)
    .single();
  if (error || !organization) throw new DomainError('FORBIDDEN');
  return {
    ...s,
    context,
    org: context.organizationId,
    allowed,
    organization,
    execution: createExecutionRepository(s.client, context.organizationId),
  };
}
