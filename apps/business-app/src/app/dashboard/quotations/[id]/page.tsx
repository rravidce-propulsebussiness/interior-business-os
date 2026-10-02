import { SharingSection } from '../sharing-section';
import { ContractHandoff } from '../../finance/handoff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { commercialSearchResultSchema } from '@business-os/core/commercial';
import { idSchema } from '@business-os/shared';
import {
  lineSnapshotSchema,
  lineCostSchema,
  estimatedContribution,
} from '@business-os/quotation-engine';
import { commercialServices } from '../../commercial/service';
import { CommandForm } from '../command-form';
import { LineForm } from '../line-form';
export default async function Quotation({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    item?: string;
    line?: string;
    category?: string;
    category_q?: string;
    category_page?: string;
    share_page?: string;
  }>;
}) {
  const { id } = await params,
    filter = await searchParams,
    s = await commercialServices('quotation.view', 'quotation', true);
  let { data: r } = await s.client
    .from('quotation_revisions')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (!r) {
    const { data: q } = await s.client
      .from('quotations')
      .select('current_revision_id')
      .eq('organization_id', s.org)
      .eq('id', id)
      .maybeSingle();
    if (q?.current_revision_id) {
      const result = await s.client
        .from('quotation_revisions')
        .select('*')
        .eq('organization_id', s.org)
        .eq('id', q.current_revision_id)
        .maybeSingle();
      r = result.data;
    }
  }
  if (!r) notFound();
  const [
    { data: root },
    { data: lines, error: lineError },
    { data: revisions },
    { data: project },
    { data: areas },
  ] = await Promise.all([
    s.client
      .from('quotations')
      .select('*')
      .eq('organization_id', s.org)
      .eq('id', r.quotation_id)
      .single(),
    s.client
      .from('quotation_items')
      .select('*')
      .eq('organization_id', s.org)
      .eq('revision_id', r.id)
      .order('sort_order')
      .order('id'),
    s.client
      .from('quotation_revisions')
      .select('id,revision_number,status')
      .eq('organization_id', s.org)
      .eq('quotation_id', r.quotation_id)
      .order('revision_number'),
    s.client
      .from('projects')
      .select('branch_id')
      .eq('organization_id', s.org)
      .eq('id', r.project_id)
      .maybeSingle(),
    s.client
      .from('project_areas')
      .select('id,name')
      .eq('organization_id', s.org)
      .eq('project_id', r.project_id)
      .eq('status', 'active')
      .order('sort_order')
      .limit(250),
  ]);
  if (!root || lineError) throw new Error('Unable to load quotation');
  const editable =
      r.status === 'draft' &&
      root.status !== 'cancelled' &&
      s.allowed('quotation.edit', 'quotation'),
    canDiscount = s.allowed('quotation.discount', 'quotation'),
    canOverride = s.allowed('quotation.override_rate', 'quotation');
  const selected = lines?.find((l) => l.id === filter.line),
    selectedSnapshot = selected
      ? lineSnapshotSchema.parse(selected.snapshot)
      : undefined,
    itemId = selected?.catalog_item_id ?? filter.item;
  const catalog =
    editable && itemId && project
      ? await s.commercial.configuration(s.org, itemId, project.branch_id)
      : undefined;
  const query = (filter.q ?? '').slice(0, 100),
    page = Math.max(1, Math.min(10000, Number(filter.page ?? 1) || 1));
  const category = filter.category ? idSchema.parse(filter.category) : null;
  const categoryQuery = (filter.category_q ?? '').slice(0, 100),
    categoryPage = Math.max(
      1,
      Math.min(10000, Number(filter.category_page ?? 1) || 1),
    );
  const matches =
    editable && s.allowed('catalog.view', 'catalog')
      ? commercialSearchResultSchema.parse(
          await s.commercial.search(
            s.org,
            'catalog_items',
            query,
            page,
            'active',
            category,
          ),
        )
      : null;
  const categories = matches
    ? commercialSearchResultSchema.parse(
        await s.commercial.search(
          s.org,
          'catalog_categories',
          categoryQuery,
          categoryPage,
          'active',
        ),
      )
    : null;
  const command = { revision_id: r.id, version: r.version };
  const canCost = s.allowed('quotation.view_internal_cost', 'quotation');
  const costs =
    canCost && lines?.length
      ? ((
          await s.client
            .from('quotation_item_costs')
            .select('item_id,cost_snapshot')
            .eq('organization_id', s.org)
            .in(
              'item_id',
              lines.map((l) => l.id),
            )
        ).data ?? [])
      : [];
  const included = lines?.filter((l) => !l.optional) ?? [];
  const includedCosts = included.flatMap((line) => {
    const cost = costs.find((c) => c.item_id === line.id);
    return cost ? [lineCostSchema.parse(cost.cost_snapshot)] : [];
  });
  const totals = r.totals;
  const contribution =
    canCost &&
    included.length === includedCosts.length &&
    totals &&
    typeof totals === 'object' &&
    !Array.isArray(totals) &&
    typeof totals.final_amount === 'string'
      ? estimatedContribution(totals.final_amount, includedCosts)
      : null;
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <Link href="/dashboard/quotations">Quotations</Link>
      {r.status === 'issued' && <ContractHandoff revisionId={r.id} />}
      <SharingSection
        revisionId={r.id}
        status={r.status}
        page={Math.max(
          1,
          Math.min(10000, Number.parseInt(filter.share_page ?? '1', 10) || 1),
        )}
      />
      <h1 className="my-6 text-3xl">
        {root.quotation_number} · Revision {r.revision_number}
      </h1>
      <p>
        {r.status} · {r.currency} · Valid until {r.valid_until}
      </p>
      <nav className="my-4 flex flex-wrap gap-3" aria-label="Revisions">
        {revisions?.map((rev) => (
          <Link
            className="underline"
            href={`/dashboard/quotations/${rev.id}`}
            key={rev.id}
          >
            R{rev.revision_number} ({rev.status})
          </Link>
        ))}
      </nav>
      <Link
        className="underline"
        href={`/dashboard/quotations/${r.id}/preview`}
      >
        Customer preview and print
      </Link>
      <Link
        className="ml-4 underline"
        href={`/dashboard/quotations/${r.id}/pdf`}
      >
        Download PDF
      </Link>
      <h2 className="mt-6 text-2xl">Items</h2>
      {!lines?.length && (
        <p>No items yet. Add a catalog item or authorized manual item.</p>
      )}
      {lines?.map((line) => {
        const snap = lineSnapshotSchema.parse(line.snapshot);
        return (
          <article key={line.id} className="my-4 rounded border p-4">
            <h3 className="font-semibold">
              {snap.name}
              {line.optional ? ' (optional)' : ''}
            </h3>
            <p>
              {snap.quantity} {snap.unit.label} · {r.currency}{' '}
              {snap.final_amount}
            </p>
            <p>{line.description}</p>
            {snap.customer_specifications.map((spec) => (
              <p key={spec.label}>
                {spec.label}: {spec.value}
              </p>
            ))}
            {editable && (
              <>
                <Link
                  className="underline"
                  href={`/dashboard/quotations/${r.id}?line=${line.id}`}
                >
                  Edit / refresh price
                </Link>
                <details>
                  <summary>
                    Move, reorder or change optional status without repricing
                  </summary>
                  <CommandForm
                    title="Save line arrangement"
                    initial={{
                      ...command,
                      action: 'arrange_line',
                      line_id: line.id,
                      area_id: line.project_area_id,
                      sort_order: line.sort_order,
                      optional: line.optional,
                      description: line.description,
                    }}
                    fields={[
                      {
                        key: 'area_id',
                        label: 'Area',
                        nullable: true,
                        options: [
                          { value: '', label: 'Ungrouped' },
                          ...(areas ?? []).map((area) => ({
                            value: area.id,
                            label: area.name,
                          })),
                        ],
                      },
                      { key: 'sort_order', label: 'Order', type: 'number' },
                      {
                        key: 'optional',
                        label: 'Optional item',
                        type: 'checkbox',
                      },
                      {
                        key: 'description',
                        label: 'Description',
                        type: 'textarea',
                      },
                    ]}
                  />
                </details>
                <CommandForm
                  title="Duplicate line without repricing"
                  initial={{
                    ...command,
                    action: 'duplicate_line',
                    line_id: line.id,
                  }}
                />
                <CommandForm
                  title="Remove line"
                  initial={{
                    ...command,
                    action: 'remove_line',
                    line_id: line.id,
                  }}
                />
              </>
            )}
          </article>
        );
      })}
      <section className="my-6">
        <h2 className="text-2xl">Totals</h2>
        {canCost &&
          (contribution ? (
            <div className="my-3 rounded border p-3">
              <p>
                Estimated cost: {contribution.estimatedCost} {r.currency}
              </p>
              <p>
                Estimated Contribution: {contribution.estimatedContribution}{' '}
                {r.currency}
              </p>
              <p>
                Estimated Contribution %:{' '}
                {contribution.estimatedContributionPercent ?? 'Not applicable'}
              </p>
              <p>Based on saved estimated costs; excludes optional items.</p>
            </div>
          ) : (
            <p>
              Estimated contribution unavailable: some included lines have no
              cost snapshot.
            </p>
          ))}
        {r.totals &&
          typeof r.totals === 'object' &&
          !Array.isArray(r.totals) &&
          Object.entries(r.totals).map(([key, value]) => (
            <p key={key}>
              {key.replaceAll('_', ' ')}:{' '}
              {typeof value === 'string' ? value : ''} {r.currency}
            </p>
          ))}
      </section>
      {editable && (
        <>
          <details>
            <summary>Edit terms, validity and revision discount</summary>
            <CommandForm
              title="Save revision"
              initial={{
                ...command,
                action: 'edit_revision',
                terms: r.terms,
                customer_notes: r.customer_notes,
                internal_notes: r.internal_notes,
                valid_until: r.valid_until,
                discount: r.discount,
              }}
              fields={[
                {
                  key: 'valid_until',
                  label: 'Valid until (YYYY-MM-DD)',
                  required: true,
                },
                { key: 'terms', label: 'Customer terms', type: 'textarea' },
                {
                  key: 'customer_notes',
                  label: 'Customer notes',
                  type: 'textarea',
                },
                {
                  key: 'internal_notes',
                  label: 'Internal notes',
                  type: 'textarea',
                },
                ...(canDiscount
                  ? [
                      {
                        key: 'discount.kind',
                        label: 'Revision discount',
                        options: [
                          { value: 'none', label: 'None' },
                          { value: 'fixed', label: 'Fixed amount' },
                          { value: 'percentage', label: 'Percentage' },
                        ],
                      },
                      { key: 'discount.value', label: 'Discount value' },
                    ]
                  : []),
              ]}
            />
          </details>
          {matches && (
            <section className="my-6">
              <h2 className="text-2xl">Add catalog item</h2>
              {categories && (
                <details className="my-4">
                  <summary>
                    Filter by category{category ? ' (filter active)' : ''}
                  </summary>
                  <form className="my-3">
                    <label>
                      Search category name{' '}
                      <input
                        className="rounded border p-2"
                        name="category_q"
                        defaultValue={categoryQuery}
                        maxLength={100}
                      />
                    </label>
                    <input type="hidden" name="q" value={query} />
                    {category && (
                      <input type="hidden" name="category" value={category} />
                    )}
                    <button className="ml-3 rounded border p-2">
                      Find categories
                    </button>
                  </form>
                  <Link
                    className="underline"
                    href={`?q=${encodeURIComponent(query)}`}
                  >
                    All categories
                  </Link>
                  <ul className="my-3 grid gap-2">
                    {categories.rows.map((row) => (
                      <li key={row.id}>
                        <Link
                          className="underline"
                          href={`?q=${encodeURIComponent(query)}&category=${row.id}`}
                        >
                          {row.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {categoryPage > 1 && (
                    <Link
                      className="mr-3 underline"
                      href={`?q=${encodeURIComponent(query)}&category_q=${encodeURIComponent(categoryQuery)}&category_page=${categoryPage - 1}`}
                    >
                      Previous categories
                    </Link>
                  )}
                  {categoryPage * 25 < categories.total && (
                    <Link
                      className="underline"
                      href={`?q=${encodeURIComponent(query)}&category_q=${encodeURIComponent(categoryQuery)}&category_page=${categoryPage + 1}`}
                    >
                      Next categories
                    </Link>
                  )}
                </details>
              )}
              <form>
                {category && (
                  <input type="hidden" name="category" value={category} />
                )}
                <label>
                  Search item name{' '}
                  <input
                    name="q"
                    defaultValue={query}
                    className="rounded border p-2"
                  />
                </label>
                <button className="ml-3 rounded border p-2">Search</button>
              </form>
              <ul className="my-4 grid gap-2">
                {matches.rows.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="underline"
                      href={`/dashboard/quotations/${r.id}?item=${item.id}`}
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
              {page > 1 && (
                <Link
                  href={`?q=${encodeURIComponent(query)}&page=${page - 1}&category=${category ?? ''}`}
                >
                  Previous{' '}
                </Link>
              )}
              {page * 25 < matches.total && (
                <Link
                  href={`?q=${encodeURIComponent(query)}&page=${page + 1}&category=${category ?? ''}`}
                >
                  Next
                </Link>
              )}
            </section>
          )}
          {catalog && (
            <LineForm
              key={selected?.id ?? itemId}
              org={s.org}
              revisionId={r.id}
              version={r.version}
              currency={r.currency}
              branch={project?.branch_id ?? null}
              areas={areas ?? []}
              catalog={catalog}
              canDiscount={canDiscount}
              canOverride={canOverride}
              {...(selected && selectedSnapshot
                ? { existing: { ...selected, snapshot: selectedSnapshot } }
                : {})}
            />
          )}{' '}
          {canOverride && (
            <details>
              <summary>
                {selectedSnapshot?.line_type === 'manual'
                  ? 'Edit manual item'
                  : 'Add manual item'}
              </summary>
              <LineForm
                key={selected?.id ?? 'manual'}
                org={s.org}
                revisionId={r.id}
                version={r.version}
                currency={r.currency}
                branch={project?.branch_id ?? null}
                areas={areas ?? []}
                canDiscount={canDiscount}
                canOverride={canOverride}
                {...(selected && selectedSnapshot?.line_type === 'manual'
                  ? { existing: { ...selected, snapshot: selectedSnapshot } }
                  : {})}
              />
            </details>
          )}
        </>
      )}
      {r.status === 'draft' && s.allowed('quotation.issue', 'quotation') && (
        <CommandForm
          title="Issue and freeze revision"
          initial={{ ...command, action: 'issue' }}
        />
      )}
      {['issued', 'superseded'].includes(r.status) &&
        s.allowed('quotation.create', 'quotation') && (
          <CommandForm
            title="Create draft revision from these snapshots"
            initial={{ ...command, action: 'clone' }}
          />
        )}
      {['draft', 'issued'].includes(r.status) &&
        s.allowed('quotation.delete', 'quotation') && (
          <CommandForm
            title="Cancel revision"
            initial={{ ...command, action: 'cancel' }}
          />
        )}
    </main>
  );
}
