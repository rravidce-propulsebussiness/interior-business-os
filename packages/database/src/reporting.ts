import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';
import { reportFilterSchema, reportKinds } from '@business-os/core/automation';
import { DomainError, idSchema } from '@business-os/shared';

const record = z.record(z.string(), z.unknown());
export const reportSchema = z.object({
  kind: z.enum(reportKinds),
  filters: record,
  rows: z.array(record),
  total: z.number(),
  page: z.number(),
  generated_at: z.string(),
  basis: z.string().optional(),
  summary: z.array(record).optional(),
  aging: z.array(record).optional(),
  dimensions: z.array(record).optional(),
  commercial: record.optional(),
  organization_name: z.string().optional(),
  generated_by: z.string().optional(),
});
export function createReportingRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const org = idSchema.parse(organizationId);
  function checked(result: { data: unknown; error: { code?: string } | null }) {
    if (result.error || result.data === null)
      throw new DomainError(
        result.error?.code === '42501' ? 'FORBIDDEN' : 'VALIDATION_FAILED',
      );
    return result.data;
  }
  return {
    async dashboard(filters: unknown) {
      return z
        .object({
          reports: z.record(
            z.string(),
            z.object({
              total: z.number(),
              summary: z.array(record),
              aging: z.array(record),
              basis: z.string(),
            }),
          ),
          work: z.record(z.string(), z.number()),
          generated_at: z.string(),
        })
        .parse(
          checked(
            await client.rpc('management_dashboard', {
              p_organization_id: org,
              p_filters: reportFilterSchema.parse(filters),
            }),
          ),
        );
    },
    async read(kind: string, filters: unknown) {
      return reportSchema.parse(
        checked(
          await client.rpc('report_read', {
            p_organization_id: org,
            p_kind: z.enum(reportKinds).parse(kind),
            p_filters: reportFilterSchema.parse(filters),
          }),
        ),
      );
    },
    async create(kind: string, filters: unknown) {
      return idSchema.parse(
        checked(
          await client.rpc('report_snapshot_create', {
            p_organization_id: org,
            p_kind: z.enum(reportKinds).parse(kind),
            p_filters: reportFilterSchema.parse(filters),
          }),
        ),
      );
    },
    async snapshot(id: string) {
      return z
        .object({
          id: idSchema,
          kind: z.enum(reportKinds),
          data: reportSchema,
          created_at: z.string(),
        })
        .parse(
          checked(
            await client.rpc('report_snapshot_read', {
              p_organization_id: org,
              p_id: idSchema.parse(id),
            }),
          ),
        );
    },
    async history(kind: string, page = 1) {
      return z.object({ rows: z.array(record), page: z.number() }).parse(
        checked(
          await client.rpc('report_snapshot_history', {
            p_organization_id: org,
            p_kind: z.enum(reportKinds).parse(kind),
            p_page: z.number().int().min(1).max(10000).parse(page),
          }),
        ),
      );
    },
  };
}
