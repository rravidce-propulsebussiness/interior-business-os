'use server';
import { revalidatePath } from 'next/cache';
import { commercialSchemas } from '@business-os/core/commercial';
import type { CommercialEntity } from '@business-os/core/commercial';
import { DomainError, safeFailure } from '@business-os/shared';
import { commercialServices } from './service';

export async function saveCommercial(
  entity: CommercialEntity,
  input: unknown,
): Promise<{ message: string; id?: string }> {
  try {
    if (!Object.hasOwn(commercialSchemas, entity))
      throw new DomainError('VALIDATION_FAILED');
    const data = commercialSchemas[entity].parse(input);
    const permission =
      entity === 'customers'
        ? 'customer.view'
        : entity === 'customer_contacts'
          ? 'customer.manage'
          : entity === 'projects'
            ? 'project.view'
            : entity === 'project_areas'
              ? 'project.manage'
              : 'settings.manage';
    const services = await commercialServices(
      permission,
      entity.startsWith('customer')
        ? 'customers'
        : entity.startsWith('project')
          ? 'projects'
          : 'quotation',
    );
    if (data.organization_id !== services.org)
      throw new DomainError('FORBIDDEN');
    const id = await services.commercial.saveEntity(services.org, entity, data);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Saved.', id };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
