import Link from 'next/link';
import { crmServices, resultSchema, optionRows } from '../service';
import { lookups, pageNumber, LookupSearch, type Params } from '../lookups';
import { Pagination } from '../pagination';
export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams,
    s = await crmServices('lead.view', true),
    choices = await lookups(s, p),
    page = pageNumber(p.page);
  const filter = Object.fromEntries(
    [
      'q',
      'stage_id',
      'assigned_to',
      'source_id',
      'branch_id',
      'priority',
      'due',
      'from',
      'until',
      'converted',
      'lifecycle',
      'sort',
      'unassigned',
    ]
      .filter((k) => p[k])
      .map((k) => [k, p[k]!]),
  );
  const result = resultSchema.parse(await s.crm.search('leads', filter, page));
  const selects = [
    ['stage_id', 'Stage', optionRows(choices.stages.rows)],
    ['assigned_to', 'Assignee', optionRows(choices.team)],
    ['source_id', 'Source', optionRows(choices.sources.rows)],
    ['branch_id', 'Branch', optionRows(choices.branches)],
    [
      'priority',
      'Priority',
      ['low', 'normal', 'high', 'urgent'].map((value) => ({
        value,
        label: value,
      })),
    ],
    [
      'lifecycle',
      'Outcome',
      ['open', 'won', 'lost', 'archived'].map((value) => ({
        value,
        label: value,
      })),
    ],
    [
      'converted',
      'Conversion',
      [
        { value: 'true', label: 'Converted' },
        { value: 'false', label: 'Not converted' },
      ],
    ],
    [
      'sort',
      'Sort',
      ['newest', 'oldest', 'followup', 'updated', 'budget'].map((value) => ({
        value,
        label: value,
      })),
    ],
  ] as const;
  return (
    <main id="main-content" className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl font-semibold">Leads</h1>
      {s.allowed('lead.create') && (
        <Link
          className="my-4 inline-block min-h-11 rounded border p-3"
          href="/dashboard/crm/leads/new"
        >
          New lead
        </Link>
      )}
      <LookupSearch />
      <form className="my-5 flex flex-wrap gap-4">
        <label>
          Search{' '}
          <input name="q" defaultValue={p.q} className="rounded border p-2" />
        </label>
        {selects.map(([key, label, options]) => (
          <label key={key}>
            {label}
            <select
              name={key}
              defaultValue={p[key] ?? ''}
              className="mx-2 rounded border p-2"
            >
              <option value="">All</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Created from <input type="date" name="from" defaultValue={p.from} />
        </label>
        <label>
          Until <input type="date" name="until" defaultValue={p.until} />
        </label>
        <label>
          <input
            type="checkbox"
            name="due"
            value="true"
            defaultChecked={!!p.due}
          />{' '}
          Follow-up due
        </label>
        <button className="min-h-11 rounded border p-2">Filter leads</button>
      </form>
      {!result.rows.length && <p>No leads match these filters.</p>}
      <ul className="grid gap-3">
        {result.rows.map((r) => (
          <li key={String(r.id)} className="rounded border p-4">
            <Link
              className="text-lg font-medium underline"
              href={'/dashboard/crm/leads/' + String(r.id)}
            >
              {String(r.name)}
            </Link>
            <p>
              {String(r.lead_number)} · {String(r.lifecycle)} ·{' '}
              {String(r.phone)}
            </p>
            <p>
              Next follow-up:{' '}
              {r.next_follow_up_at
                ? new Date(String(r.next_follow_up_at)).toLocaleString()
                : 'Not scheduled'}
            </p>
          </li>
        ))}
      </ul>
      <Pagination
        path="/dashboard/crm/leads"
        params={p}
        page={page}
        total={result.total}
      />
    </main>
  );
}
