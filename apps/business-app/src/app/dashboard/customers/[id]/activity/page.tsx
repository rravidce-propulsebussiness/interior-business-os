import Link from 'next/link';
import { commercialServices } from '../../../commercial/service';
import { createReportingRepository } from '@business-os/database/reporting';
import { canAccess } from '@business-os/auth';
import { activeOrganization } from '@business-os/auth/server';
import { reportPermissions } from '../../../reports/service';
import { ReportTable } from '../../../reports/table';
import { notFound } from 'next/navigation';
export default async function CustomerActivity({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    s = await commercialServices('customer.view', 'customers', true),
    context = await activeOrganization();
  const { data: customer } = await s.client
    .from('customers')
    .select('id,display_name')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (!customer || !context) notFound();
  const organization = (await s.repository.organizations()).find(
    (row) => row.id === s.org,
  );
  const to = new Intl.DateTimeFormat('en-CA', {
    timeZone: organization?.default_timezone ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const now = new Date(to + 'T12:00:00Z');
  now.setUTCFullYear(now.getUTCFullYear() - 10);
  const from = now.toISOString().slice(0, 10);
  const kinds = (['crm', 'sales', 'billing', 'projects'] as const).filter(
    (kind) =>
      canAccess(context, {
        organizationId: s.org,
        permission: reportPermissions[kind],
      }),
  );
  const reports = await Promise.all(
    kinds.map(async (kind) => ({
      kind,
      report: await createReportingRepository(s.client, s.org).read(kind, {
        from,
        to,
        customerId: id,
      }),
    })),
  );
  const rows = reports
    .flatMap(({ kind, report }) =>
      report.rows.map((row): Record<string, unknown> => ({
        ...row,
        domain: kind,
      })),
    )
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 25);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-7xl space-y-5 p-6"
    >
      <Link href={`/dashboard/customers/${id}`} className="underline">
        Customer
      </Link>
      <h1 className="text-3xl font-semibold">
        {customer.display_name}: activity
      </h1>
      <p>
        Most recent 25 authorized records from CRM, quotations, billing and
        projects over the last ten years. Each domain keeps its own permissions
        and canonical history.
      </p>
      <ReportTable rows={rows} />
      <nav className="flex flex-wrap gap-4">
        {reports.map(({ kind, report }) => (
          <Link
            key={kind}
            className="underline"
            href={`/dashboard/reports/${kind}?customerId=${id}&from=${from}&to=${to}`}
          >
            All {kind} records ({report.total})
          </Link>
        ))}
      </nav>
      {!kinds.length && (
        <p>Your role does not include customer reporting access.</p>
      )}
    </main>
  );
}
