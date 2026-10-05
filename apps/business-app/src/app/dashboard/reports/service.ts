import 'server-only';
import { createReportingRepository } from '@business-os/database/reporting';
import { automationServices } from '../automations/service';
import type { reportKinds } from '@business-os/core/automation';
export const reportPermissions: Record<(typeof reportKinds)[number], string> = {
  crm: 'report.crm.view',
  sales: 'report.sales.view',
  billing: 'report.billing.view',
  receivables: 'report.billing.view',
  projects: 'report.project.view',
  procurement: 'report.procurement.view',
  inventory: 'report.inventory.view',
  execution: 'report.execution.view',
  snags: 'report.execution.view',
  handover: 'report.execution.view',
  subcontractors: 'report.execution.view',
  cost: 'report.cost.view',
};
export async function reportingServices(kind: string, page = false) {
  const s = await automationServices(
    reportPermissions[kind as (typeof reportKinds)[number]] ?? 'report.export',
    page,
  );
  return {
    ...s,
    reports: createReportingRepository(s.client, s.context.organizationId),
  };
}
