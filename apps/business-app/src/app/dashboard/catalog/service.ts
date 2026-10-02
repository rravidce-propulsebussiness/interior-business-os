import 'server-only';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { createCatalogRepository } from '@business-os/database/catalog';
import { calculate, previewSchema } from '@business-os/quotation-engine';
import { DomainError } from '@business-os/shared';
export async function authorizedCatalog(
  org: string,
  permission: string,
  moduleKey: string,
) {
  const services = await serverServices(),
    context = await activeOrganization();
  if (!context || context.organizationId !== org)
    throw new DomainError('FORBIDDEN');
  await services.authorization.requirePermission(org, 'catalog.view', {
    moduleKey: 'catalog',
  });
  await services.authorization.requirePermission(org, permission, {
    moduleKey,
  });
  return {
    ...services,
    catalogRepository: createCatalogRepository(services.client),
  };
}
export async function calculatePreview(input: unknown) {
  const value = previewSchema.parse(input),
    services = await authorizedCatalog(
      value.organization_id,
      'pricing.view',
      'pricing',
    );
  const catalog = await services.catalogRepository.load(
    value.organization_id,
    true,
  );
  try {
    return calculate(catalog, value);
  } catch {
    throw new DomainError('VALIDATION_FAILED');
  }
}
