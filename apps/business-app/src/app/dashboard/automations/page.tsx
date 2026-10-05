import Link from 'next/link';
import { automationServices } from './service';
import { RetryJob } from './builder';
export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; page?: string }>;
}) {
  const query = await searchParams,
    s = await automationServices('automation.view', true);
  const section =
    query.section === 'history' ||
    query.section === 'events' ||
    query.section === 'emails' ||
    query.section === 'templates'
      ? query.section
      : 'rules';
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(query.page)) || 1),
  );
  const data = await s.automation.read(section, page);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl space-y-5 p-6"
    >
      <Link className="underline" href="/dashboard">
        Dashboard
      </Link>
      <header className="flex justify-between gap-5">
        <h1 className="text-2xl font-semibold">Business automations</h1>
        <Link
          className="rounded border px-3 py-2"
          href="/dashboard/automations/new"
        >
          New rule
        </Link>
      </header>
      <nav className="flex flex-wrap gap-5" aria-label="Automation sections">
        <Link className="underline" href="/dashboard/automations/settings">
          Settings
        </Link>
        {['rules', 'history', 'events', 'emails', 'templates'].map((v) => (
          <Link
            key={v}
            aria-current={v === section ? 'page' : undefined}
            className="underline"
            href={`?section=${v}`}
          >
            {v}
          </Link>
        ))}
      </nav>
      <p>
        {data.total} {section}
      </p>
      {data.rows.length === 0 && (
        <p className="rounded border p-6">
          No {section} yet. Rules can be saved paused and tested against visible
          source events.
        </p>
      )}
      <div className="space-y-3">
        {data.rows.map((row) => (
          <article
            key={String(row.id)}
            className="space-y-3 rounded border p-4"
          >
            <h2 className="font-semibold">
              {section === 'rules' ? (
                <Link
                  className="underline"
                  href={`/dashboard/automations/${row.id}`}
                >
                  {String(row.name)}
                </Link>
              ) : (
                String(
                  row.rule_name ??
                    row.event_type ??
                    row.template_key ??
                    row.key ??
                    'Execution',
                )
              )}
            </h2>
            <p>
              {String(row.status ?? '')} {String(row.event_type ?? '')}{' '}
              {String(row.reason ?? row.error_code ?? '')}
            </p>
            {row.created_at !== undefined && (
              <p className="text-sm">{String(row.created_at)}</p>
            )}
            {section === 'templates' && <p>{String(row.subject)}</p>}
            {Array.isArray(row.jobs) &&
              row.jobs.map((item: unknown) => {
                const job = item as Record<string, unknown>;
                return (
                  <div
                    key={String(job.id)}
                    className="space-y-2 border-t pt-3 text-sm"
                  >
                    <p>
                      {String(job.kind)} · {String(job.status)} · Attempts{' '}
                      {String(job.attempts)} · {String(job.error_code)}
                    </p>
                    <p>Scheduled: {String(job.run_at)}</p>
                    {job.status === 'failed' && (
                      <RetryJob id={String(job.id)} />
                    )}
                  </div>
                );
              })}
          </article>
        ))}
      </div>
      <nav className="flex gap-5" aria-label="Automation pages">
        {page > 1 && (
          <Link href={`?section=${section}&page=${page - 1}`}>Previous</Link>
        )}
        {page * 25 < data.total && (
          <Link href={`?section=${section}&page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
