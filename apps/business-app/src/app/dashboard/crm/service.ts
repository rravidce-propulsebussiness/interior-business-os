import 'server-only';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { createCrmRepository } from '@business-os/database/crm';
import { DomainError } from '@business-os/shared';
import { z } from 'zod';
export async function crmServices(permission = 'lead.view', page = false) {
  const s = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  await s.authorization.requirePermission(context.organizationId, permission, {
    moduleKey: 'crm',
  });
  return {
    ...s,
    recentLeadDate: new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .slice(0, 10),
    org: context.organizationId,
    context,
    crm: createCrmRepository(s.client, context.organizationId),
    allowed: (permission: string, moduleKey = 'crm') =>
      canAccess(context, {
        organizationId: context.organizationId,
        permission,
        moduleKey,
      }),
  };
}
export const resultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
  page: z.number(),
});
export const optionRows = (rows: Record<string, unknown>[]) =>
  rows.map((r) => ({
    value: String(r.id ?? r.user_id),
    label: String(r.name ?? r.full_name ?? r.display_name ?? ''),
  }));
export const fieldValue = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === 'string' ? (row[key] as string) : '';
