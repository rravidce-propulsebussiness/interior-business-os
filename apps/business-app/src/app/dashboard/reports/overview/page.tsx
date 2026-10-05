import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createReportingRepository } from '@business-os/database/reporting';
import { reportFilterSchema } from '@business-os/core/automation';
import { DomainError } from '@business-os/shared';
import { ReportTable } from '../table';
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const s = await pageServices(),
    context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  const org = (await s.repository.organizations()).find(
      (item) => item.id === context.organizationId,
    ),
    zone = org?.default_timezone ?? 'UTC';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const query = await searchParams,
    date = new Date(today + 'T12:00:00Z');
  let from = today.slice(0, 7) + '-01';
  if (query.period === 'today') from = today;
  if (query.period === 'week') {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    from = date.toISOString().slice(0, 10);
  }
  if (query.period === 'quarter')
    from = `${today.slice(0, 4)}-${String(Math.floor(date.getUTCMonth() / 3) * 3 + 1).padStart(2, '0')}-01`;
  const filters = reportFilterSchema.parse({
    from: query.period === 'custom' ? (query.from ?? from) : from,
    to: query.period === 'custom' ? (query.to ?? today) : today,
  });
  const dashboard = await createReportingRepository(
    s.client,
    context.organizationId,
  ).dashboard(filters);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-7xl space-y-6 p-6"
    >
      <Link className="underline" href="/dashboard">
        Dashboard
      </Link>
      <h1 className="text-3xl font-semibold">Management overview</h1>
      <form className="flex flex-wrap items-end gap-3">
        <label className="grid">
          Period
          <select
            name="period"
            defaultValue={query.period ?? 'month'}
            className="rounded border p-2"
          >
            {['today', 'week', 'month', 'quarter', 'custom'].map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>
        <label className="grid">
          Custom start
          <input
            className="rounded border p-2"
            name="from"
            type="date"
            defaultValue={filters.from}
          />
        </label>
        <label className="grid">
          Custom end
          <input
            className="rounded border p-2"
            name="to"
            type="date"
            defaultValue={filters.to}
          />
        </label>
        <button className="rounded border px-4 py-2">Apply</button>
      </form>
      <p>
        {filters.from} to {filters.to} · {zone}
      </p>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Current work</h2>
        <p className="text-sm">
          Live open work across all dates. Today and overdue use the
          organization timezone.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(dashboard.work).map(([group, count]) => (
            <Link
              className="rounded border p-4"
              key={group}
              href={`/dashboard/work?group=${group}`}
            >
              <span className="block text-2xl font-semibold">{count}</span>
              <span className="capitalize">
                {group === 'assigned' ? 'Assigned to me' : group}
              </span>
            </Link>
          ))}
        </div>
      </section>
      {Object.entries(dashboard.reports).map(([kind, report]) => (
        <section className="space-y-3 rounded border p-4" key={kind}>
          <div className="flex justify-between gap-4">
            <h2 className="text-xl font-semibold capitalize">{kind}</h2>
            <Link
              className="underline"
              href={`/dashboard/reports/${kind}?from=${filters.from}&to=${filters.to}`}
            >
              View {report.total} records
            </Link>
          </div>
          <p className="text-sm text-slate-600">{report.basis}</p>
          <ReportTable rows={report.summary} />
          {report.aging.length > 0 && <ReportTable rows={report.aging} />}
        </section>
      ))}
      {!Object.keys(dashboard.reports).length && (
        <p>No reporting permissions are enabled for your role.</p>
      )}
    </main>
  );
}
