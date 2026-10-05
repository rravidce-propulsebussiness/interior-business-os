import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './generated/database.types';
import { validateDocument, kitSchema } from '@business-os/brochure-builder';
import { DomainError, idSchema } from '@business-os/shared';
export const brochureJson = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;
export function brochureResult<T>(r: { data: T | null; error: unknown }): T {
  if (r.error || r.data === null) throw new DomainError('VALIDATION_FAILED');
  return r.data;
}
export function jsonObject(value: Json) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DomainError('VALIDATION_FAILED');
  return value;
}
export function createBrochureRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const org = idSchema.parse(organizationId);
  return {
    async list(page = 1) {
      const r = jsonObject(
        brochureResult(
          await client.rpc('brochure_read', {
            p_organization_id: org,
            p_page: page,
          }),
        ),
      );
      const kit = r.kit ? jsonObject(r.kit) : null;
      return {
        items: Array.isArray(r.items) ? r.items.map(jsonObject) : [],
        limits: r.limits,
        business: jsonObject(r.business ?? {}),
        kit: kitSchema.parse(kit?.content ?? {}),
        kitVersion: Number(kit?.version ?? 1),
      };
    },
    async read(id: string, versionId?: string, page = 1) {
      const r = jsonObject(
        brochureResult(
          await client.rpc('brochure_read', {
            p_organization_id: org,
            p_brochure_id: idSchema.parse(id),
            p_page: page,
            ...(versionId ? { p_version_id: idSchema.parse(versionId) } : {}),
          }),
        ),
      );
      return {
        id: String(r.id),
        name: String(r.name),
        slug: String(r.slug),
        status: String(r.status),
        version: Number(r.version),
        document: validateDocument(r.document),
        businessName: String(r.businessName),
        publishedVersionId: r.publishedVersionId
          ? String(r.publishedVersionId)
          : null,
        selectedVersion: r.selectedVersion,
        limits: r.limits,
        versions: Array.isArray(r.versions) ? r.versions.map(jsonObject) : [],
      };
    },
    async save(
      id: string | null,
      version: number,
      body: string,
      signature: string,
    ) {
      return jsonObject(
        brochureResult(
          await client.rpc('brochure_write', {
            p_organization_id: org,
            p_brochure_id: id!,
            p_version: version,
            p_proof: body,
            p_signature: signature,
          }),
        ),
      );
    },
    async assets(page = 1) {
      const r = brochureResult(
        await client.rpc('brochure_media', {
          p_organization_id: org,
          p_action: 'list',
          p_page: page,
        }),
      );
      return Array.isArray(r) ? r.map(jsonObject) : [];
    },
    async asset(id: string) {
      return jsonObject(
        brochureResult(
          await client.rpc('brochure_media', {
            p_organization_id: org,
            p_action: 'read',
            p_asset_id: idSchema.parse(id),
          }),
        ),
      );
    },
  };
}
