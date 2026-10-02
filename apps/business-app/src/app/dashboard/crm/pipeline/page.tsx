import { crmServices, resultSchema } from '../service';
import { pageNumber, type Params } from '../lookups';
import { PipelineBoard } from './board';
import { Pagination } from '../pagination';
export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams,
    s = await crmServices('lead.view', true),
    page = pageNumber(p.page);
  const [a, b] = await Promise.all([
    s.crm.search('crm_pipeline_stages', {}, pageNumber(p.stage_page)),
    s.crm.search(
      'leads',
      {
        q: p.q ?? '',
        ...(p.stage_id ? { stage_id: p.stage_id } : {}),
        ...(p.assigned_to ? { assigned_to: p.assigned_to } : {}),
      },
      page,
    ),
  ]);
  const stages = resultSchema.parse(a),
    leads = resultSchema.parse(b);
  return (
    <main id="main-content" className="mx-auto max-w-7xl p-6">
      <h1 className="text-3xl font-semibold">Sales pipeline</h1>
      <form className="my-4 flex flex-wrap gap-3">
        <label>
          Search leads{' '}
          <input name="q" defaultValue={p.q} className="rounded border p-2" />
        </label>
        <label>
          Stage{' '}
          <select
            name="stage_id"
            defaultValue={p.stage_id ?? ''}
            className="rounded border p-2"
          >
            <option value="">All</option>
            {stages.rows.map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {String(r.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stage choices page{' '}
          <input
            type="number"
            min="1"
            name="stage_page"
            defaultValue={pageNumber(p.stage_page)}
            className="w-20 rounded border p-2"
          />
        </label>
        <button className="rounded border p-2">Filter board</button>
      </form>
      <p>
        This window contains up to 25 leads and 25 stages. Filter by stage or
        use pagination to see more.
      </p>
      <PipelineBoard
        stages={stages.rows}
        leads={leads.rows}
        canManage={s.allowed('lead.manage')}
      />
      <Pagination
        path="/dashboard/crm/pipeline"
        params={p}
        page={page}
        total={leads.total}
      />
    </main>
  );
}
