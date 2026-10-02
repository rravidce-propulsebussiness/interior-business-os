import Link from 'next/link';
import {
  commercialSearchResultSchema,
  searchSchema,
} from '@business-os/core/commercial';
import { commercialServices } from '../commercial/service';
import { SearchList } from '../commercial/list';
import { CommandForm } from './command-form';
export default async function Quotations({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    project?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams,
    filter = searchSchema.parse({
      query: params.q ?? '',
      page: Number(params.page ?? 1),
      status: params.status ?? '',
      parent_id: params.project ?? null,
    }),
    s = await commercialServices('quotation.view', 'quotation', true);
  const result = commercialSearchResultSchema.parse(
    await s.commercial.search(
      s.org,
      'quotations',
      filter.query,
      filter.page,
      filter.status,
    ),
  );
  const { data: organization } = await s.client
    .from('organizations')
    .select('default_currency')
    .eq('id', s.org)
    .single();
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <SearchList
        title="Quotations"
        path="/dashboard/quotations"
        query={filter.query}
        page={filter.page}
        status={filter.status}
        total={result.total}
        rows={result.rows.map((r) => ({
          id: r.id,
          label: r.quotation_number ?? '',
          detail: `${r.customer_name} · ${r.project_name} · ${r.status} · ${r.currency} ${r.amount}`,
        }))}
      />
      {s.allowed('settings.manage', 'quotation') && (
        <Link
          href="/dashboard/quotations/settings"
          className="my-6 block underline"
        >
          Quotation settings and branding
        </Link>
      )}
      {filter.parent_id && s.allowed('quotation.create', 'quotation') ? (
        <CommandForm
          title="Create quotation"
          initial={{
            action: 'create',
            project_id: filter.parent_id,
            currency: organization?.default_currency ?? '',
          }}
          fields={[{ key: 'currency', label: 'Currency code', required: true }]}
        />
      ) : (
        <p className="my-6">Open a project to create its quotation.</p>
      )}
    </main>
  );
}
