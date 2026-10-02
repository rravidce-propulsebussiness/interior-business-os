import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './generated/database.types';
import { DomainError, idSchema } from '@business-os/shared';
export function crmResult<T>(result: {
  data: T | null;
  error: { code?: string } | null;
}): T {
  if (result.error || result.data === null)
    throw new DomainError(
      result.error?.code === '42501'
        ? 'FORBIDDEN'
        : result.error?.code === '40001' || result.error?.code === '23505'
          ? 'CONFLICT'
          : 'VALIDATION_FAILED',
    );
  return result.data;
}
export function createCrmRepository(
  client: SupabaseClient<Database>,
  organization: string,
) {
  const org = idSchema.parse(organization);
  return {
    async search(entity: string, filter: Json = {}, page = 1) {
      return crmResult(
        await client.rpc('crm_search', {
          p_organization_id: org,
          p_entity: entity,
          p_filter: filter,
          p_page: page,
        }),
      );
    },
    async save(entity: string, input: Json) {
      return crmResult(
        await client.rpc('crm_save', {
          p_organization_id: org,
          p_entity: entity,
          p_input: input,
        }),
      );
    },
    async command(action: string, input: Json) {
      return crmResult(
        await client.rpc('crm_command', {
          p_organization_id: org,
          p_action: action,
          p_input: input,
        }),
      );
    },
    async convert(input: Json) {
      return crmResult(
        await client.rpc('crm_convert', {
          p_organization_id: org,
          p_input: input,
        }),
      );
    },
    async duplicates(phone: string, email: string) {
      return crmResult(
        await client.rpc('crm_duplicates', {
          p_organization_id: org,
          p_phone: phone,
          p_email: email,
        }),
      );
    },
    async assignees(query = '', page = 1) {
      return crmResult(
        await client.rpc('crm_assignees', {
          p_organization_id: org,
          p_query: query,
          p_page: page,
        }),
      );
    },
  };
}
