import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { catalogPage } from '../access';
import { ConfigForm } from '../forms';
import { PricePreview } from '../preview';
export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    { catalog, org, canManage, canPrice, canManagePrice, canCost } =
      await catalogPage();
  const item = catalog.items.find((i) => i.id === id);
  if (!item) notFound();
  const { repository } = await pageServices(),
    industries = await repository.industries();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl px-6 py-10"
    >
      <nav className="flex gap-5">
        <Link href="/dashboard/catalog">Catalog</Link>
        {canPrice && (
          <Link href="/dashboard/pricing">Price books and rate revisions</Link>
        )}
      </nav>
      <h1 className="my-6 text-3xl font-semibold">{item.name}</h1>
      <details>
        <summary>Item settings</summary>
        {canManage ? (
          <ConfigForm
            entity="catalog_items"
            catalog={catalog}
            org={org}
            record={item}
            industries={industries}
            title="Save item"
          />
        ) : (
          <p>
            {item.description} · {item.unit_key} · {item.method_key}
          </p>
        )}
      </details>
      <section className="my-8">
        <h2 className="text-2xl">Questions and options</h2>
        {!catalog.attributes.some((a) => a.item_id === id) && (
          <p>No questions configured.</p>
        )}
        {catalog.attributes
          .filter((a) => a.item_id === id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((a) => (
            <details key={a.id} className="my-3 rounded border bg-card p-4">
              <summary>
                {a.label} · {a.input_type} · {a.status}
              </summary>
              {canManage && (
                <ConfigForm
                  entity="catalog_item_attributes"
                  catalog={catalog}
                  org={org}
                  itemId={id}
                  record={a}
                  title="Save question"
                />
              )}
              {catalog.options
                .filter((o) => o.attribute_id === a.id)
                .map((o) => (
                  <details key={o.id} className="my-3">
                    <summary>
                      {o.label} · {o.status}
                    </summary>
                    {canManage && (
                      <ConfigForm
                        entity="catalog_attribute_options"
                        catalog={catalog}
                        org={org}
                        itemId={id}
                        record={o}
                        title="Save option"
                      />
                    )}
                  </details>
                ))}
              {canManage &&
                ['select', 'multi_select'].includes(a.input_type) && (
                  <details>
                    <summary>Add option</summary>
                    <ConfigForm
                      entity="catalog_attribute_options"
                      catalog={catalog}
                      org={org}
                      itemId={id}
                      record={{ attribute_id: a.id }}
                      title="Create option"
                    />
                  </details>
                )}
            </details>
          ))}
        {canManage && (
          <details>
            <summary>Add question</summary>
            <ConfigForm
              entity="catalog_item_attributes"
              catalog={catalog}
              org={org}
              itemId={id}
              title="Create question"
            />
          </details>
        )}
      </section>
      {canPrice && (
        <section className="my-8">
          <h2 className="text-2xl">Selling rates and modifiers</h2>
          <ul>
            {catalog.rates
              .filter((r) => r.item_id === id)
              .map((r) => (
                <li key={r.id}>
                  {r.base_rate} {r.currency} / {item.unit_key} · minimum{' '}
                  {r.minimum_rate ?? 'none'} · {r.valid_from} →{' '}
                  {r.valid_until ?? 'open'} ({r.status})
                </li>
              ))}
          </ul>
          {canManagePrice && (
            <details>
              <summary>Add rate</summary>
              <ConfigForm
                entity="price_book_items"
                catalog={catalog}
                org={org}
                itemId={id}
                title="Create rate"
              />
            </details>
          )}
          {canManagePrice && canCost && (
            <details>
              <summary>Add internal estimated cost</summary>
              <ConfigForm
                entity="pricing_costs"
                catalog={{
                  ...catalog,
                  rates: catalog.rates.filter((r) => r.item_id === id),
                }}
                org={org}
                canCost
                title="Save internal cost"
              />
            </details>
          )}
          {catalog.modifiers
            .filter((m) => m.item_id === id)
            .map((m) => (
              <details key={m.id} className="my-3">
                <summary>
                  {m.label}: {m.value} ({m.kind}) · {m.status}
                </summary>
                {canManagePrice && (
                  <ConfigForm
                    entity="pricing_modifiers"
                    catalog={catalog}
                    org={org}
                    itemId={id}
                    record={m}
                    title="Save modifier"
                  />
                )}
              </details>
            ))}
          {canManagePrice && (
            <details>
              <summary>Add modifier</summary>
              <ConfigForm
                entity="pricing_modifiers"
                catalog={catalog}
                org={org}
                itemId={id}
                title="Create modifier"
              />
            </details>
          )}
        </section>
      )}
      {canPrice && <PricePreview catalog={catalog} org={org} itemId={id} />}
    </main>
  );
}
