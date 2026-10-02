import Link from 'next/link';
import { crmServices, resultSchema } from './service';
import { pageNumber, type Params } from './lookups';
import { Pagination } from './pagination';
import { MasterForm } from '../commercial/master-form';
import { runCrmCommand } from './actions';
export async function SalesQueue({
  params,
  visits = false,
}: {
  params: Params;
  visits?: boolean;
}) {
  const s = await crmServices('lead.view', true),
    page = pageNumber(params.page),
    path = '/dashboard/crm/' + (visits ? 'site-visits' : 'followups');
  const filter = Object.fromEntries(
    ['queue', 'assigned_to', 'lead_id', 'type']
      .filter((k) => params[k])
      .map((k) => [k, params[k]!]),
  );
  const result = resultSchema.parse(
    await s.crm.search(
      visits ? 'site_visits' : 'lead_followups',
      {
        ...filter,
        status: params.status ?? (visits ? 'scheduled' : 'pending'),
      },
      page,
    ),
  );
  return (
    <main id="main-content" className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-semibold">
        {visits ? 'Site visits' : 'Follow-ups'}
      </h1>
      <form className="my-5 flex flex-wrap gap-4">
        <label>
          Queue{' '}
          <select
            name="queue"
            defaultValue={params.queue ?? ''}
            className="rounded border p-2"
          >
            <option value="">All</option>
            {['today', 'overdue', 'upcoming'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Status{' '}
          <select
            name="status"
            defaultValue={params.status ?? (visits ? 'scheduled' : 'pending')}
            className="rounded border p-2"
          >
            {(visits
              ? ['scheduled', 'rescheduled', 'completed', 'cancelled']
              : ['pending', 'completed', 'cancelled']
            ).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {params.lead_id && (
          <input type="hidden" name="lead_id" value={params.lead_id} />
        )}
        <button className="min-h-11 rounded border p-2">Filter queue</button>
      </form>
      {!result.rows.length && <p>No records in this queue.</p>}
      <ul>
        {result.rows.map((r) => (
          <li key={String(r.id)} className="my-4 rounded border p-4">
            <Link
              className="underline"
              href={'/dashboard/crm/leads/' + String(r.lead_id)}
            >
              Open lead workspace
            </Link>
            <p>
              {new Date(
                String(visits ? r.scheduled_at : r.due_at),
              ).toLocaleString()}{' '}
              · {String(r.status)}
            </p>
            <p className="whitespace-pre-wrap">
              {String(visits ? r.notes : r.note)}
            </p>
            {!visits &&
              r.status === 'pending' &&
              s.allowed('crm.followup.manage') && (
                <MasterForm
                  title="Complete follow-up"
                  submitAction={runCrmCommand}
                  initial={{
                    action: 'followup',
                    id: r.id,
                    version: r.version,
                    status: 'completed',
                    outcome: '',
                  }}
                  fields={[{ key: 'outcome', label: 'Outcome' }]}
                />
              )}
          </li>
        ))}
      </ul>
      <Pagination
        path={path}
        params={params}
        page={page}
        total={result.total}
      />
    </main>
  );
}
