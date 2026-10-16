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
import { ConstructionSelector } from '../construction-selector';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { createConstructionPackagesRepository } from '@business-os/database/construction-packages';
import { documentHeaderSchema } from '@business-os/core/quotation-document';
import { parseSftEstimate } from '@business-os/core/sft-quotation';
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
  const existingSftEstimate =
    lines?.map((line) => parseSftEstimate(line.description)).find(Boolean) ??
    null;
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
  const constructionOptions =
    editable &&
    canOverride &&
    r.currency === 'INR' &&
    s.allowed('pricing.view', 'pricing')
      ? await createConstructionRatesRepository(s.client).list(s.org)
      : null;
  const constructionPackages = constructionOptions
    ? await createConstructionPackagesRepository(s.client).list(s.org)
    : [];
  // Historical header is already captured on the quotation revision.
  const clientHeader = documentHeaderSchema.safeParse(r.document_snapshot);
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
      {clientHeader.success && (
        <section className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              1 · Client details
            </p>
            <h2 className="mt-2 text-lg font-extrabold text-slate-950">
              {clientHeader.data.customer.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {clientHeader.data.customer.phone} ·{' '}
              {clientHeader.data.customer.email}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {clientHeader.data.customer.legal_name}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              Project
            </p>
            <h2 className="mt-2 text-lg font-extrabold text-slate-950">
              {clientHeader.data.project.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Project code: {clientHeader.data.project.code}
            </p>
          </div>
        </section>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/dashboard/quotations/settings"
          className="rounded-xl border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700"
        >
          Company quotation code &amp; design ↗
        </Link>
        <Link
          href="/dashboard/pricing/construction"
          className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
        >
          Company packages and material rates ↗
        </Link>
      </div>
      <h2 className="mt-6 text-2xl font-extrabold">2 · Pricing details</h2>
      <p className="mt-1 text-xs text-slate-600">
        Choose a fixed per-sq-ft package or build a customized quote using
        individual material and brand rates.
      </p>
      <h3 className="mt-6 text-lg font-bold text-slate-900">
        Saved quotation items
      </h3>
      {!lines?.length && (
        <p>No items yet. Add a catalog item or authorized manual item.</p>
      )}
      {lines?.map((line) => {
        const snap = lineSnapshotSchema.parse(line.snapshot);
        const sft = parseSftEstimate(line.description);
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
            {sft ? (
              <div className="my-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[600px] w-full text-left text-xs text-slate-800">
                  <thead className="bg-slate-50 font-extrabold">
                    <tr>
                      <th className="px-3 py-2">Work</th>
                      <th className="px-3 py-2">L</th>
                      <th className="px-3 py-2">W</th>
                      <th className="px-3 py-2">SFT</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sft.rows.map((row, index) => (
                      <tr className="border-t border-slate-100" key={index}>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.lengthFeet}</td>
                        <td className="px-3 py-2">{row.widthFeet}</td>
                        <td className="px-3 py-2">{row.areaSqft}</td>
                        <td className="px-3 py-2">{row.ratePerSqft}</td>
                        <td className="px-3 py-2">{row.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap justify-between gap-2 bg-blue-50 px-3 py-3 text-xs font-bold">
                  <span>Total area: {sft.totalAreaSqft} sq ft</span>
                  <span>
                    Floorwise estimate: {sft.total} {r.currency}
                  </span>
                </div>
                {sft.materials.length > 0 && (
                  <div className="p-3 text-xs text-slate-600">
                    <strong className="block pb-1 text-slate-900">
                      Included material and brand specifications
                    </strong>
                    {sft.materials.map((material) => (
                      <p key={material.category}>
                        {material.category}: {material.name}{' '}
                        {material.specification}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{line.description}</p>
            )}
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
          {constructionOptions && (
            <ConstructionSelector
              rates={constructionOptions}
              packages={constructionPackages}
              initialSchedule={existingSftEstimate}
              revisionId={r.id}
              version={r.version}
            />
          )}
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
      <section className="my-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-extrabold text-slate-950">
          3 · Materials and brand specifications
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          The selected package scope and brand specifications are included in
          each saved quotation line. In package mode, they do not increase the
          package price. In customized mode, every material has its own price
          and line total. Download the customer PDF to review the final
          presentation.
        </p>
      </section>
      {r.status === 'issued' && <ContractHandoff revisionId={r.id} />}
      <SharingSection
        revisionId={r.id}
        status={r.status}
        page={Math.max(
          1,
          Math.min(10000, Number.parseInt(filter.share_page ?? '1', 10) || 1),
        )}
      />
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
    </main>
  );
}
