import 'server-only';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { createCatalogRepository } from '@business-os/database/catalog';
import { DomainError } from '@business-os/shared';
import { notFound } from 'next/navigation';
export async function catalogPage(pricing = false) {
  const services = await pageServices();
  try {
    const context = await activeOrganization();
    if (!context) notFound();
    await services.authorization.requirePermission(
      context.organizationId,
      'catalog.view',
      { moduleKey: 'catalog' },
    );
    if (pricing)
      await services.authorization.requirePermission(
        context.organizationId,
        'pricing.view',
        { moduleKey: 'pricing' },
      );
    const allowed = (permission: string, moduleKey: string) =>
      canAccess(context, {
        organizationId: context.organizationId,
        permission,
        moduleKey,
      });
    return {
      catalog: await createCatalogRepository(services.client).load(
        context.organizationId,
      ),
      org: context.organizationId,
      canManage: allowed('catalog.manage', 'catalog'),
      canPrice: allowed('pricing.view', 'pricing'),
      canManagePrice:
        allowed('pricing.manage', 'pricing') &&
        allowed('pricing.view', 'pricing'),
      canCost: allowed('quotation.view_internal_cost', 'pricing'),
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
}
