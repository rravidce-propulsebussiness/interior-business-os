import 'server-only';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { createOperationsRepository } from '@business-os/database/operations';
import { DomainError } from '@business-os/shared';
import { canUseOperations } from './access';
export async function operationsServices(permission: string, page = false) {
  const s = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context || !canUseOperations(context, permission))
    throw new DomainError('FORBIDDEN');
  const allowed = (p: string) => canUseOperations(context, p);
  return {
    ...s,
    context,
    allowed,
    operations: createOperationsRepository(s.client, context.organizationId),
  };
}
