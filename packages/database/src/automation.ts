import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';
import { preferenceSchema, ruleSchema } from '@business-os/core/automation';
import { DomainError, idSchema } from '@business-os/shared';

const object = z.record(z.string(), z.unknown());
const results = z.object({
  rows: z.array(object),
  total: z.number(),
  page: z.number(),
  unread: z.number().optional(),
});
function checked<T>(result: {
  data: T | null;
  error: { code?: string } | null;
}): T {
  if (result.error || result.data === null)
    throw new DomainError(
      result.error?.code === '42501' ? 'FORBIDDEN' : 'VALIDATION_FAILED',
    );
  return result.data;
}
export function createAutomationRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const org = idSchema.parse(organizationId);
  return {
    async settings() {
      const result = await client
        .from('automation_settings')
        .select('*')
        .eq('organization_id', org)
        .maybeSingle();
      if (result.error) throw new DomainError('FORBIDDEN');
      return result.data;
    },
    async configure(
      section: 'settings' | 'template' | 'consent',
      input: Record<string, string | number | boolean>,
      version: number,
    ) {
      return checked(
        await client.rpc('automation_configure', {
          p_organization_id: org,
          p_section: section,
          p_input: input,
          p_version: version,
        }),
      );
    },
    async work(group = 'assigned', page = 1) {
      return results.extend({ today: z.string(), timezone: z.string() }).parse(
        checked(
          await client.rpc('work_queue', {
            p_organization_id: org,
            p_group: group,
            p_page: page,
          }),
        ),
      );
    },
    async read(
      section: 'rules' | 'history' | 'events' | 'emails' | 'templates',
      page = 1,
      id?: string,
    ) {
      return results.parse(
        checked(
          await client.rpc('automation_read', {
            p_organization_id: org,
            p_section: section,
            p_page: z.number().int().min(1).max(10000).parse(page),
            ...(id ? { p_id: idSchema.parse(id) } : {}),
          }),
        ),
      );
    },
    async save(configuration: unknown, id?: string, version = 0) {
      return z.object({ id: idSchema, version: z.number().int() }).parse(
        checked(
          await client.rpc('automation_rule_save', {
            p_organization_id: org,
            p_configuration: ruleSchema.parse(configuration),
            // PostgreSQL accepts NULL for creation; catalog types lack argument nullability.
            p_id: id ? idSchema.parse(id) : (null as unknown as string),
            p_version: version,
          }),
        ),
      );
    },
    async test(rule: string, event: string) {
      return object.parse(
        checked(
          await client.rpc('automation_test', {
            p_organization_id: org,
            p_rule_id: idSchema.parse(rule),
            p_event_id: idSchema.parse(event),
          }),
        ),
      );
    },
    async retry(job: string) {
      const result = await client.rpc('automation_retry', {
        p_organization_id: org,
        p_job_id: idSchema.parse(job),
      });
      if (result.error) throw new DomainError('VALIDATION_FAILED');
    },
    async notifications(page = 1, status?: 'unread' | 'read' | 'archived') {
      return results.parse(
        checked(
          await client.rpc('notifications_read', {
            p_organization_id: org,
            p_page: page,
            ...(status ? { p_status: status } : {}),
          }),
        ),
      );
    },
    async target(id: string) {
      return object.parse(
        checked(
          await client.rpc('notification_target', {
            p_organization_id: org,
            p_id: idSchema.parse(id),
          }),
        ),
      );
    },
    async mark(
      id: string,
      version: number,
      status: 'unread' | 'read' | 'archived',
    ) {
      return checked(
        await client.rpc('notification_state', {
          p_organization_id: org,
          p_id: idSchema.parse(id),
          p_version: version,
          p_status: status,
        }),
      );
    },
    async preferences() {
      const result = await client
        .from('notification_preferences')
        .select('configuration,version')
        .eq('organization_id', org)
        .maybeSingle();
      if (result.error) throw new DomainError('FORBIDDEN');
      return {
        configuration: preferenceSchema.parse(result.data?.configuration ?? {}),
        version: result.data?.version ?? 0,
      };
    },
    async savePreferences(configuration: unknown, version: number) {
      return checked(
        await client.rpc('notification_preferences_save', {
          p_organization_id: org,
          p_version: version,
          p_configuration: preferenceSchema.parse(configuration),
        }),
      );
    },
  };
}
