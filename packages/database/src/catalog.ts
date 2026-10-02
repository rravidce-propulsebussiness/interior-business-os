import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './generated/database.types';
import { catalogSchema, entitySchemas } from '@business-os/quotation-engine';
import type { Entity } from '@business-os/quotation-engine';
import { DomainError, idSchema } from '@business-os/shared';

function checked<T>(result: {
  data: T | null;
  error: { code?: string } | null;
}): T {
  if (result.error || result.data === null)
    throw new DomainError(
      result.error?.code === '42501'
        ? 'FORBIDDEN'
        : result.error?.code === '40001'
          ? 'CONFLICT'
          : 'VALIDATION_FAILED',
    );
  return result.data;
}
export function createCatalogRepository(client: SupabaseClient<Database>) {
  return {
    async load(organizationId: string, pricing = false) {
      return catalogSchema.parse(
        checked(
          await client.rpc('catalog_snapshot', {
            p_organization_id: idSchema.parse(organizationId),
            p_pricing: pricing,
          }),
        ),
      );
    },
    async setRateStatus(
      org: string,
      id: string,
      version: number,
      status: 'active' | 'inactive',
    ) {
      const result = await client.rpc('set_rate_status', {
        p_organization_id: idSchema.parse(org),
        p_id: idSchema.parse(id),
        p_version: version,
        p_status: status,
      });
      checked({ ...result, data: true });
    },
    async save(
      org: string,
      entity: Entity,
      input: unknown,
      replace?: { id: string; version: number },
    ) {
      const value = entitySchemas[entity].parse(input);
      if (value.organization_id !== idSchema.parse(org))
        throw new DomainError('FORBIDDEN');
      return checked(
        await client.rpc('save_catalog_entity', {
          p_organization_id: org,
          p_entity: entity,
          p_input: value as Json,
          ...(replace
            ? {
                p_replace_id: idSchema.parse(replace.id),
                p_replace_version: replace.version,
              }
            : {}),
        }),
      );
    },
  };
}
