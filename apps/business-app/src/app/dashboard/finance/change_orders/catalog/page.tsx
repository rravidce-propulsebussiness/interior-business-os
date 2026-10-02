import Link from 'next/link';
import { commercialSearchResultSchema } from '@business-os/core/commercial';
import { createQuotationRepository } from '@business-os/database/quotations';
import { financeServices } from '../../service';
import { text } from '../../presentation';
import { CatalogChangeForm } from '../../catalog-change-form';
export default async function CatalogChange({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams,
    s = await financeServices('change_order.create', true);
  await s.authorization.requirePermission(s.org, 'catalog.view', {
    moduleKey: 'catalog',
  });
  await s.authorization.requireEntitlement(s.org, 'pricing');
  if (!q.contract_id)
    return (
      <main id="main-content" className="p-6">
        <Link href="/dashboard/finance/contracts">Choose a contract first</Link>
      </main>
    );
  const contract = await s.finance.detail('contracts', q.contract_id),
    page = Math.max(1, Number(q.page) || 1),
    items = commercialSearchResultSchema.parse(
      await createQuotationRepository(s.client).search(
        s.org,
        'catalog_items',
        q.q ?? '',
        page,
        'active',
      ),
    );
  const scope = await s.finance.scope(q.contract_id);
  const catalog = q.item
    ? await s.finance.configuration(q.contract_id, q.item)
    : null;
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl">Catalog-backed change order</h1>
      <p className="my-3">
        {text(contract, 'contract_number')} / Original accepted prices remain
        unchanged.
      </p>
      <form className="my-4 flex gap-3">
        <input type="hidden" name="contract_id" value={q.contract_id} />
        <label>
          Catalog item
          <input
            className="block rounded border p-2"
            name="q"
            defaultValue={q.q}
          />
        </label>
        <button className="rounded border p-2">Search</button>
      </form>
      <ul>
        {items.rows.map((i) => (
          <li key={i.id}>
            <Link
              className="underline"
              href={`?contract_id=${q.contract_id}&item=${i.id}`}
            >
              {i.name}
            </Link>
          </li>
        ))}
      </ul>
      {page * 25 < items.total && (
        <Link
          href={`?contract_id=${q.contract_id}&q=${encodeURIComponent(q.q ?? '')}&page=${page + 1}`}
        >
          Next items
        </Link>
      )}
      {catalog && (
        <CatalogChangeForm
          org={s.org}
          contractId={q.contract_id}
          currency={text(contract, 'currency')}
          branch={text(contract, 'branch_id') || null}
          catalog={catalog}
          scope={scope
            .filter((r) => !r.already_changed)
            .map((r) => ({
              id: text(r, 'id'),
              name: text(r, 'name'),
              amount: text(r, 'contracted_amount'),
            }))}
        />
      )}
    </main>
  );
}
