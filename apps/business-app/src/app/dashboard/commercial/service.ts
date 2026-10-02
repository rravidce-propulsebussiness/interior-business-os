import 'server-only';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { createQuotationRepository } from '@business-os/database/quotations';
import { DomainError } from '@business-os/shared';

export async function commercialServices(
  permission: string,
  capability: 'customers' | 'projects' | 'quotation',
  page = false,
) {
  const services = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  const org = context.organizationId;
  const allowed = (permission: string, moduleKey: string) =>
    canAccess(context, { organizationId: org, permission, moduleKey });
  if (capability === 'customers') {
    if (!allowed(permission, 'crm') && !allowed(permission, 'quotation'))
      throw new DomainError('FORBIDDEN');
  } else
    await services.authorization.requirePermission(org, permission, {
      moduleKey: capability,
    });
  return {
    ...services,
    org,
    context,
    allowed,
    commercial: createQuotationRepository(services.client),
  };
}
