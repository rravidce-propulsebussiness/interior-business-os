import Link from 'next/link';
import { notFound } from 'next/navigation';
import { reportFilterSchema, reportKinds } from '@business-os/core/automation';
import { canAccess } from '@business-os/auth';
import { reportingServices } from '../service';
import { ReportTable, ReportBreakdown } from '../table';
import { saveReport } from '../actions';
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { kind } = await params;
  if (!reportKinds.includes(kind as (typeof reportKinds)[number])) notFound();
  const s = await reportingServices(kind, true),
    query = await searchParams;
  const organization = (await s.repository.organizations()).find(
    (org) => org.id === s.context.organizationId,
  );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: organization?.default_timezone ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const input: Record<string, unknown> = {
    from: today.slice(0, 7) + '-01',
    to: today,
  };
  for (const key of [
    'from',
    'to',
    'projectId',
    'customerId',
    'assigneeId',
    'industryId',
    'location',
    'status',
  ])
    if (typeof query[key] === 'string' && query[key]) input[key] = query[key];
  if (query.page) input.page = Number(query.page);
  if (typeof query.agingBuckets === 'string' && query.agingBuckets)
    input.agingBuckets = query.agingBuckets.split(',').map(Number);
  const parsed = reportFilterSchema.safeParse(input),
    cumulative = ['inventory', 'cost'].includes(kind);
  const needsProject = cumulative && !input.projectId;
  const projectSearch =
    typeof query.projectSearch === 'string'
      ? query.projectSearch.slice(0, 80)
      : '';
  const customerSearch =
    typeof query.customerSearch === 'string'
      ? query.customerSearch.slice(0, 80)
      : '';
  const [projects, customers, industries] = await Promise.all([
    s.client
      .from('projects')
      .select('id,name')
      .eq('organization_id', s.context.organizationId)
      .ilike('name', `%${projectSearch}%`)
      .order('name')
      .limit(100),
    s.client
      .from('customers')
      .select('id,display_name')
      .eq('organization_id', s.context.organizationId)
      .ilike('display_name', `%${customerSearch}%`)
      .order('display_name')
      .limit(100),
    s.repository.industries(),
  ]);
  const choices: Record<string, { id: string; name: string }[]> = {
    projectId: projects.data ?? [],
    customerId: (customers.data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name,
    })),
    industryId: industries,
  };
  const data =
    parsed.success && !needsProject
      ? await s.reports.read(kind, parsed.data)
      : null;
  const history = canAccess(s.context, {
    organizationId: s.context.organizationId,
    permission: 'report.export',
  })
    ? await s.reports.history(kind)
    : null;
  function pageLink(page: number) {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (typeof value === 'string') q.set(key, value);
    q.set('page', String(page));
    return `?${q}`;
  }
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-7xl space-y-5 p-6"
    >
      <Link href="/dashboard/reports" className="underline">
        All reports
      </Link>
      <h1 className="text-3xl font-semibold capitalize">{kind} report</h1>
      <form className="flex flex-wrap items-end gap-3 rounded border p-4">
        <label className="grid gap-1">
          Find project options
          <input
            className="rounded border p-2"
            name="projectSearch"
            defaultValue={projectSearch}
            maxLength={80}
          />
        </label>
        {!cumulative && (
          <label className="grid gap-1">
            Find customer options
            <input
              className="rounded border p-2"
              name="customerSearch"
              defaultValue={customerSearch}
              maxLength={80}
            />
          </label>
        )}
        {['from', 'to'].map((key) => (
          <label key={key} className="grid gap-1 capitalize">
            {key}
            <input
              className="rounded border p-2"
              type="date"
              name={key}
              defaultValue={String(input[key])}
              required
            />
          </label>
        ))}
        {(cumulative
          ? ['projectId']
          : [
              'projectId',
              'customerId',
              'assigneeId',
              'industryId',
              'location',
              'status',
            ]
        ).map((key) => (
          <label key={key} className="grid gap-1">
            {key.replace('Id', '')}
            {choices[key] ? (
              <select
                className="rounded border p-2"
                name={key}
                defaultValue={String(input[key] ?? '')}
                required={cumulative && key === 'projectId'}
              >
                <option value="">All / select</option>
                {choices[key].map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="rounded border p-2"
                name={key}
                defaultValue={String(input[key] ?? '')}
                required={cumulative && key === 'projectId'}
              />
            )}
          </label>
        ))}
        {kind === 'receivables' && (
          <label className="grid gap-1">
            Aging boundaries (days)
            <input
              className="rounded border p-2"
              name="agingBuckets"
              defaultValue={String(query.agingBuckets ?? '30,60,90')}
            />
          </label>
        )}
        <button className="rounded bg-slate-900 px-4 py-2 text-white">
          Apply filters
        </button>
      </form>
      {!parsed.success && (
        <p role="alert">Check the dates, IDs and aging boundaries.</p>
      )}
      {needsProject && (
        <p>Select a project for cumulative material or cost balances.</p>
      )}
      {data && (
        <>
          <p className="rounded bg-slate-50 p-4 text-sm">
            {data.basis ??
              'Cumulative canonical project material balances at generation time; dates do not truncate ledger balances.'}
          </p>
          <p>
            {data.total} records · Generated{' '}
            {new Date(data.generated_at).toLocaleString('en-IN', {
              timeZone: organization?.default_timezone ?? 'UTC',
            })}
          </p>
          {data.summary && (
            <section className="space-y-2">
              <h2 className="font-semibold">
                Summary by source, status and currency
              </h2>
              <ReportTable rows={data.summary} />
            </section>
          )}
          {!!data.dimensions?.length && (
            <section className="space-y-2">
              <h2 className="font-semibold">
                Pipeline and operational breakdowns
              </h2>
              <ReportBreakdown rows={data.dimensions} />
            </section>
          )}
          {!!data.aging?.length && (
            <section className="space-y-2">
              <h2 className="font-semibold">Receivables aging</h2>
              <ReportTable rows={data.aging} />
            </section>
          )}
          {data.commercial && <ReportTable rows={[data.commercial]} />}
          <ReportTable rows={data.rows} />
          <nav className="flex gap-5" aria-label="Report pages">
            {data.page > 1 && (
              <Link className="underline" href={pageLink(data.page - 1)}>
                Previous
              </Link>
            )}
            {data.page * 25 < data.total && (
              <Link className="underline" href={pageLink(data.page + 1)}>
                Next
              </Link>
            )}
          </nav>
          {history && (
            <form action={saveReport}>
              <input type="hidden" name="kind" value={kind} />
              <input
                type="hidden"
                name="filters"
                value={JSON.stringify(parsed.data)}
              />
              <button className="rounded border px-4 py-2">
                Save export snapshot
              </button>
              <p className="mt-2 text-sm">
                Captures all matching rows, up to 5,000, with its filters and
                calculation basis.
              </p>
            </form>
          )}
        </>
      )}
      {history && (
        <section className="space-y-2">
          <h2 className="font-semibold">Saved exports</h2>
          {history.rows.map((row) => (
            <p key={String(row.id)}>
              <Link
                className="underline"
                href={`/dashboard/reports/snapshots/${row.id}`}
              >
                {String(row.created_at)}
              </Link>
            </p>
          ))}
        </section>
      )}
    </main>
  );
}
