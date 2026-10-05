'use server';
import { redirect } from 'next/navigation';
import { reportFilterSchema } from '@business-os/core/automation';
import { reportingServices } from './service';
export async function saveReport(form: FormData) {
  const kind = String(form.get('kind'));
  const filters = reportFilterSchema.parse(
    JSON.parse(String(form.get('filters'))),
  );
  const s = await reportingServices(kind);
  await s.authorization.requirePermission(
    s.context.organizationId,
    'report.export',
  );
  const id = await s.reports.create(kind, filters);
  redirect(`/dashboard/reports/snapshots/${id}`);
}
