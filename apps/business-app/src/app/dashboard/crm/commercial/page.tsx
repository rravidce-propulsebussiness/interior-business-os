import Link from 'next/link';
import { commercialServices } from '../../commercial/service';
import { crmResult } from '@business-os/database/crm';
import { resultSchema } from '../service';
import { pageNumber, type Params } from '../lookups';
import { Pagination } from '../pagination';
export default async function Responses({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams,
    s = await commercialServices(
      'quotation.customer_response.view',
      'quotation',
      true,
    ),
    page = pageNumber(p.page),
    result = resultSchema.parse(
      crmResult(
        await s.client.rpc('quotation_response_queue', {
          p_organization_id: s.org,
          p_status: p.status ?? '',
          p_page: page,
        }),
      ),
    );
  return (
    <main id="main-content" className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-semibold">Quotation customer responses</h1>
      <form className="my-5">
        <label>
          Response status{' '}
          <select
            name="status"
            defaultValue={p.status ?? ''}
            className="rounded border p-2"
          >
            <option value="">All</option>
            {['awaiting', 'approved', 'changes_requested', 'declined'].map(
              (v) => (
                <option key={v} value={v}>
                  {v.replaceAll('_', ' ')}
                </option>
              ),
            )}
          </select>
        </label>
        <button className="rounded border p-2">Filter responses</button>
      </form>
      {!result.rows.length && <p>No current issued quotations match.</p>}
      {result.rows.map((r) => (
        <article key={String(r.id)} className="my-4 rounded border p-4">
          <Link
            className="underline"
            href={'/dashboard/quotations/' + String(r.id)}
          >
            {String(r.quotation_number)} Rev {String(r.revision_number)} ·{' '}
            {String(r.project_name)}
          </Link>
          <h2>
            {r.response_status === 'approved'
              ? 'Commercially accepted'
              : String(r.response_status).replaceAll('_', ' ')}
          </h2>
          <p>
            {String(r.customer_name ?? '')} {String(r.responded_at ?? '')}
          </p>
          <p className="whitespace-pre-wrap">{String(r.comment ?? '')}</p>
        </article>
      ))}
      <Pagination
        path="/dashboard/crm/commercial"
        params={p}
        page={page}
        total={result.total}
      />
    </main>
  );
}
