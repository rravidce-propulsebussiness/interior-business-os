import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './generated/database.types';
import {
  catalogSchema,
  catalogLine,
  catalogLineInputSchema,
  manualLine,
  manualLineInputSchema,
} from '@business-os/quotation-engine';
import { DomainError, idSchema } from '@business-os/shared';
import { attestQuotation } from './quotation-attestation';

function checked<T>(result: {
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
export function createQuotationRepository(client: SupabaseClient<Database>) {
  async function signed(
    org: string,
    operation: 'commit' | 'pricing_context',
    payload: Record<string, unknown>,
  ) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new DomainError('UNAUTHENTICATED');
    const key = process.env.QUOTATION_SIGNING_KEY;
    if (!key) throw new DomainError('INTERNAL_ERROR');
    return attestQuotation(
      key,
      data.user.id,
      idSchema.parse(org),
      operation,
      payload,
    );
  }
  async function commit(org: string, payload: Record<string, unknown>) {
    return checked(
      await client.rpc(
        'commit_quotation',
        await signed(org, 'commit', payload),
      ),
    );
  }
  return {
    commit,
    async search(
      org: string,
      entity: string,
      query = '',
      page = 1,
      status = '',
      parentId: string | null = null,
    ) {
      return checked(
        await client.rpc('commercial_search', {
          p_organization_id: idSchema.parse(org),
          p_entity: entity,
          p_query: query,
          p_page: page,
          p_status: status,
          ...(parentId ? { p_parent_id: parentId } : {}),
        }),
      );
    },
    async saveEntity(org: string, entity: string, input: Json) {
      return checked(
        await client.rpc('save_commercial_entity', {
          p_organization_id: idSchema.parse(org),
          p_entity: entity,
          p_input: input,
        }),
      );
    },
    async configuration(org: string, item: string, branch: string | null) {
      return catalogSchema.parse(
        checked(
          await client.rpc('quotation_item_configuration', {
            p_organization_id: idSchema.parse(org),
            p_item_id: idSchema.parse(item),
            ...(branch ? { p_branch_id: branch } : {}),
          }),
        ),
      );
    },
    async saveCatalogLine(
      org: string,
      revisionId: string,
      version: number,
      input: unknown,
    ) {
      const value = catalogLineInputSchema.parse(input);
      if (value.pricing.organization_id !== org)
        throw new DomainError('FORBIDDEN');
      // Time is authoritative at the server, never a browser-selected historical rate.
      value.pricing.at = new Date().toISOString();
      const raw = checked(
        await client.rpc(
          'quotation_calculation_context',
          await signed(org, 'pricing_context', {
            item_id: value.pricing.item_id,
            branch_id: value.pricing.branch_id,
          }),
        ),
      );
      if (
        !raw ||
        typeof raw !== 'object' ||
        Array.isArray(raw) ||
        typeof raw.fingerprint !== 'string'
      )
        throw new DomainError('INTERNAL_ERROR');
      const result = catalogLine(catalogSchema.parse(raw.catalog), value);
      return commit(org, {
        action: 'save_line',
        revision_id: revisionId,
        version,
        line_id: value.id ?? null,
        catalog_item_id: value.pricing.item_id,
        area_id: value.area_id,
        sort_order: value.sort_order,
        optional: value.optional,
        description: value.description,
        ...result,
        fingerprint: raw.fingerprint,
      });
    },
    async saveManualLine(
      org: string,
      revisionId: string,
      version: number,
      input: unknown,
    ) {
      const value = manualLineInputSchema.parse(input),
        result = manualLine(value);
      return commit(org, {
        action: 'save_line',
        revision_id: revisionId,
        version,
        line_id: value.id ?? null,
        catalog_item_id: null,
        area_id: value.area_id,
        sort_order: value.sort_order,
        optional: value.optional,
        description: value.description,
        ...result,
      });
    },
  };
}
