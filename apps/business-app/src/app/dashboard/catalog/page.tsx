import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { catalogPage } from './access';
import { ConfigForm } from './forms';
export default async function CatalogPage() {
  const { catalog, org, canManage, canPrice } = await catalogPage();
  const { repository } = await pageServices(),
    industries = await repository.industries();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl px-6 py-10"
    >
      <nav className="flex gap-5">
        <Link href="/dashboard">Dashboard</Link>
        {canPrice && <Link href="/dashboard/pricing">Pricing</Link>}
      </nav>
      <h1 className="my-6 text-3xl font-semibold">Catalog</h1>
      <section>
        <h2 className="text-2xl">Items</h2>
        {!catalog.items.length && (
          <p className="my-4">
            No items yet. Create your first finished-work item.
          </p>
        )}
        <ul className="my-5 grid gap-3 sm:grid-cols-2">
          {catalog.items.map((i) => (
            <li key={i.id} className="rounded border bg-card p-4">
              <Link
                className="font-semibold underline"
                href={'/dashboard/catalog/' + i.id}
              >
                {i.name}
              </Link>
              <p>
                {i.key} · {i.status} · {i.unit_key}
              </p>
            </li>
          ))}
        </ul>
        {canManage && (
          <details>
            <summary>Add item</summary>
            <ConfigForm
              entity="catalog_items"
              catalog={catalog}
              org={org}
              industries={industries}
              title="Create item"
            />
          </details>
        )}
      </section>
      <section className="my-8">
        <h2 className="text-2xl">Categories</h2>
        {!catalog.categories.length && <p>No categories configured.</p>}
        {catalog.categories.map((c) => (
          <details key={c.id} className="my-3 rounded border p-3">
            <summary>
              {c.name} · {c.status}
              {c.parent_id
                ? ' / ' +
                  catalog.categories.find((p) => p.id === c.parent_id)?.name
                : ''}
            </summary>
            {canManage && (
              <ConfigForm
                entity="catalog_categories"
                catalog={catalog}
                org={org}
                record={c}
                industries={industries}
                title="Save category"
              />
            )}
          </details>
        ))}
        {canManage && (
          <details>
            <summary>Add category</summary>
            <ConfigForm
              entity="catalog_categories"
              catalog={catalog}
              org={org}
              industries={industries}
              title="Create category"
            />
          </details>
        )}
      </section>
      <details className="my-8">
        <summary>Units and measurement methods</summary>
        <p>
          Reference methods are safe predefined calculations. Dimensions use the
          unit system shown in each label.
        </p>
        <ul>
          {catalog.units.map((u) => (
            <li key={u.key}>
              {u.key}: {u.label}
            </li>
          ))}
        </ul>
        <ul className="mt-4">
          {catalog.methods.map((m) => (
            <li key={m.key}>
              {m.label}: {m.fields.join(' × ') || '1'}
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
