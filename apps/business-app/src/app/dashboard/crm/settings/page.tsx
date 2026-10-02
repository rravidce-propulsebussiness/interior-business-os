import Link from 'next/link';
import { crmServices, resultSchema } from '../service';
import { pageNumber, type Params } from '../lookups';
import { MasterForm, type Field } from '../../commercial/master-form';
import { saveCrm } from '../actions';
import { Pagination } from '../pagination';
import type { CrmEntity } from '@business-os/core/crm';
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams,
    s = await crmServices('lead.view', true);
  const entities = [
    ['lead_sources', 'Lead sources', 'crm.source.manage'],
    ['crm_pipeline_stages', 'Pipeline stages', 'crm.pipeline.manage'],
    ['crm_lost_reasons', 'Lost reasons', 'crm.pipeline.manage'],
    ['crm_requirement_fields', 'Requirement fields', 'crm.pipeline.manage'],
  ] as const;
  const selected = entities.find((e) => e[0] === p.entity) ?? entities[0],
    entity = selected[0],
    page = pageNumber(p.page);
  const result = resultSchema.parse(
    await s.crm.search(entity, { q: p.q ?? '' }, page),
  );
  const industries = await s.repository.industries();
  const fields: Field[] = [
    { key: 'name', label: 'Name', required: true },
    { key: 'key', label: 'Stable key', required: true },
    { key: 'sort_order', label: 'Sort order', type: 'number' },
    { key: 'active', label: 'Active', type: 'checkbox' },
  ];
  if (entity === 'crm_pipeline_stages')
    fields.push({
      key: 'outcome',
      label: 'Outcome semantics',
      options: ['open', 'won', 'lost'].map((value) => ({
        value,
        label: value,
      })),
    });
  if (entity === 'crm_requirement_fields')
    fields.push(
      {
        key: 'industry_id',
        label: 'Industry',
        nullable: true,
        options: [
          { value: '', label: 'Any industry' },
          ...industries.map((i) => ({ value: i.id, label: i.name })),
        ],
      },
      {
        key: 'field_type',
        label: 'Field type',
        options: ['text', 'number', 'select', 'boolean'].map((value) => ({
          value,
          label: value,
        })),
      },
      {
        key: 'options',
        label: 'Select choices (one per line)',
        type: 'textarea',
      },
      { key: 'required', label: 'Required answer', type: 'checkbox' },
    );
  const blank = {
    name: '',
    key: '',
    sort_order: 0,
    active: true,
    ...(entity === 'crm_pipeline_stages' ? { outcome: 'open' } : {}),
    ...(entity === 'crm_requirement_fields'
      ? { industry_id: null, field_type: 'text', options: '', required: false }
      : {}),
  };
  return (
    <main id="main-content" className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-semibold">CRM configuration</h1>
      <nav className="my-5 flex flex-wrap gap-5">
        {entities.map(([key, label]) => (
          <Link className="underline" key={key} href={'?entity=' + key}>
            {label}
          </Link>
        ))}
      </nav>
      <h2 className="text-xl">{selected[1]}</h2>
      <form className="my-4">
        <input type="hidden" name="entity" value={entity} />
        <label>
          Search{' '}
          <input name="q" defaultValue={p.q} className="rounded border p-2" />
        </label>
        <button className="rounded border p-2">Search</button>
      </form>
      {result.rows.map((row) => (
        <details key={String(row.id)} className="my-3 rounded border p-3">
          <summary>
            {String(row.name)} {row.active ? '' : '(inactive)'}
          </summary>
          {s.allowed(selected[2]) ? (
            <MasterForm
              title="Save configuration"
              submitAction={saveCrm.bind(null, entity as CrmEntity)}
              initial={Object.fromEntries(
                ['id', 'version', ...fields.map((f) => f.key)].map((k) => [
                  k,
                  k === 'options' && Array.isArray(row[k])
                    ? row[k].join('\n')
                    : row[k],
                ]),
              )}
              fields={fields}
            />
          ) : (
            <p>Read-only configuration.</p>
          )}
        </details>
      ))}
      <Pagination
        path="/dashboard/crm/settings"
        params={p}
        page={page}
        total={result.total}
      />
      {s.allowed(selected[2]) && (
        <section>
          <h2 className="text-xl font-semibold">Add configuration</h2>
          <MasterForm
            title="Add configuration"
            submitAction={saveCrm.bind(null, entity as CrmEntity)}
            initial={blank}
            fields={fields}
          />
        </section>
      )}
    </main>
  );
}
