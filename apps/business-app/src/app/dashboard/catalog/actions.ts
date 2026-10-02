'use server';
import { revalidatePath } from 'next/cache';
import { entitySchemas } from '@business-os/quotation-engine';
import type { Entity, Calculation } from '@business-os/quotation-engine';
import { DomainError, safeFailure } from '@business-os/shared';
import { authorizedCatalog, calculatePreview } from './service';
export async function saveCatalog(
  org: string,
  entity: Entity,
  input: unknown,
  replace?: { id: string; version: number },
): Promise<{ message: string; id?: string }> {
  try {
    if (!Object.hasOwn(entitySchemas, entity))
      throw new DomainError('VALIDATION_FAILED');
    const pricing = [
      'price_books',
      'price_book_items',
      'pricing_modifiers',
      'pricing_costs',
    ].includes(entity);
    const services = await authorizedCatalog(
      org,
      pricing ? 'pricing.manage' : 'catalog.manage',
      pricing ? 'pricing' : 'catalog',
    );
    if (pricing)
      await services.authorization.requirePermission(org, 'pricing.view', {
        moduleKey: 'pricing',
      });
    if (entity === 'pricing_costs')
      await services.authorization.requirePermission(
        org,
        'quotation.view_internal_cost',
        { moduleKey: 'pricing' },
      );
    const id = await services.catalogRepository.save(
      org,
      entity,
      input,
      replace,
    );
    revalidatePath('/dashboard/catalog');
    revalidatePath('/dashboard/pricing');
    return { message: 'Saved. Configuration is up to date.', id };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function previewPrice(
  input: unknown,
): Promise<{ message: string; result?: Calculation }> {
  try {
    const result = await calculatePreview(input);
    return { message: 'Calculated from saved configuration.', result };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function changeRateStatus(
  org: string,
  id: string,
  version: number,
  status: 'active' | 'inactive',
) {
  try {
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      !['active', 'inactive'].includes(status)
    )
      throw new DomainError('VALIDATION_FAILED');
    const services = await authorizedCatalog(org, 'pricing.manage', 'pricing');
    await services.catalogRepository.setRateStatus(org, id, version, status);
    revalidatePath('/dashboard/pricing');
    revalidatePath('/dashboard/catalog');
    return { message: 'Rate status updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
