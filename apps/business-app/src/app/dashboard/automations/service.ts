import 'server-only';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { createAutomationRepository } from '@business-os/database/automation';
import { DomainError } from '@business-os/shared';
export async function automationServices(permission: string, page = false) {
  const services = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  await services.authorization.requirePermission(
    context.organizationId,
    permission,
  );
  return {
    ...services,
    context,
    automation: createAutomationRepository(
      services.client,
      context.organizationId,
    ),
  };
}
