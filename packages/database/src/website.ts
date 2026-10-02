import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './generated/database.types';
import {
  validateDocument,
  type WebsiteDocument,
} from '@business-os/website-builder';
import { DomainError, idSchema } from '@business-os/shared';
function checked<T>(r: { data: T | null; error: { code?: string } | null }): T {
  if (r.error || r.data === null)
    throw new DomainError(
      r.error?.code === '42501' ? 'FORBIDDEN' : 'VALIDATION_FAILED',
    );
  return r.data;
}
export function websiteJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
export function createWebsiteRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const org = idSchema.parse(organizationId);
  return {
    async list() {
      return checked(
        await client
          .from('websites')
          .select('id,name,slug,status,version,published_version_id,updated_at')
          .eq('organization_id', org)
          .order('updated_at', { ascending: false })
          .limit(100),
      );
    },
    async read(id: string, versionId?: string) {
      const raw = checked(
        await client.rpc('website_read', {
          p_organization_id: org,
          p_website_id: idSchema.parse(id),
          ...(versionId ? { p_version_id: idSchema.parse(versionId) } : {}),
        }),
      );
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new DomainError('VALIDATION_FAILED');
      return {
        ...raw,
        id: String(raw.id),
        name: String(raw.name),
        slug: String(raw.slug),
        status: String(raw.status),
        version: Number(raw.version),
        document: validateDocument(raw.document),
        limits: raw.limits,
      };
    },
    async create(name: string, slug: string, document: WebsiteDocument) {
      return checked(
        await client.rpc('website_create', {
          p_organization_id: org,
          p_name: name,
          p_slug: slug,
          p_document: websiteJson(validateDocument(document)),
        }),
      );
    },
    async save(id: string, version: number, section: string, value: unknown) {
      return checked(
        await client.rpc('website_save', {
          p_organization_id: org,
          p_website_id: idSchema.parse(id),
          p_version: version,
          p_section: section,
          p_value: websiteJson(value),
        }),
      );
    },
    async publish(
      id: string,
      version: number,
      body: string,
      signature: string,
      summary: string,
      restoreId?: string,
    ) {
      return checked(
        await client.rpc('website_publish', {
          p_organization_id: org,
          p_website_id: idSchema.parse(id),
          p_version: version,
          p_build_text: body,
          p_signature: signature,
          p_summary: summary,
          ...(restoreId ? { p_restore_id: idSchema.parse(restoreId) } : {}),
        }),
      );
    },
    async status(id: string, version: number, status: string) {
      const r = await client.rpc('website_status', {
        p_organization_id: org,
        p_website_id: idSchema.parse(id),
        p_version: version,
        p_status: status,
      });
      if (r.error) throw new DomainError('VALIDATION_FAILED');
    },
    async records(
      id: string,
      entity:
        | 'website_domains'
        | 'website_assets'
        | 'website_members'
        | 'website_events'
        | 'website_versions',
      page = 1,
    ) {
      const columns =
        entity === 'website_versions'
          ? 'id,website_id,sequence,summary,created_at,restored_from'
          : '*';
      const r = await client
        .from(entity)
        .select(columns)
        .eq('organization_id', org)
        .eq('website_id', idSchema.parse(id))
        .order('created_at', { ascending: false })
        .range((page - 1) * 25, page * 25 - 1);
      return checked(r);
    },
  };
}
