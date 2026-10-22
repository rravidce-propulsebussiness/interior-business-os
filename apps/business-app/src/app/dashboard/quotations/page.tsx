import Link from 'next/link';
import { Fragment } from 'react';
import {
  commercialSearchResultSchema,
  searchSchema,
} from '@business-os/core/commercial';
import { commercialServices } from '../commercial/service';
import { QuotationStudioFrame } from './studio-frame';
import { QuotationRemovalButton } from './quotation-removal-button';
import { QuotationReviseButton } from './quotation-revise-button';
import { QuotationFinalButton } from './quotation-final-button';
import { QuotationMobileMore, QuotationMobileFooter } from './quotation-mobile-disclosures';
import './quotations-list.css';

export const dynamic = 'force-dynamic';

const initials = (value: string) =>
  value.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || 'QT';

function niceDate(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(parsed);
}

function currencyValue(currency: string, amount: string | null | undefined) {
  const numeric = Number(amount);
  if (amount === null || amount === undefined || !Number.isFinite(numeric)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return currency + ' ' + numeric.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
}

const statusTabs = [
  { label: 'All', status: '' },
  { label: 'Shared', status: 'shared' },
] as const;

export default async function Quotations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const p = await searchParams;
  const viewStatus = p.status === 'shared' ? 'shared' : '';
  const filter = searchSchema.parse({
    query: p.q ?? '',
    page: Math.min(10000, Math.max(1, Number.parseInt(p.page || '1', 10) || 1)),
    status: viewStatus === 'shared' ? 'issued' : viewStatus,
    parent_id: null,
  });
  const s = await commercialServices('quotation.view', 'quotation', true);
  const [result, organization, user] = await Promise.all([
    s.commercial.search(s.org, 'quotations', filter.query, filter.page, filter.status),
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const parsed = commercialSearchResultSchema.safeParse(result);
  if (!parsed.success) {
    console.error('[quotations:list] Core search schema error', {
      issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })),
    });
    throw new Error('Quotation search returned invalid data');
  }
  const data = parsed.data;
  // Superseded and cancelled revisions remain in history, not the everyday list.
  const rows = data.rows.filter((row) => row.status === 'draft' || row.status === 'issued');

  // The commercial search returns revisions. Show a single latest revision per
  // quotation in the list, not a second customer/CRN list with repeated cards.
  // Keep every revision in the existing quotation detail/studio screens.
  const revisionIds = rows.map((row) => row.id);
  const { data: revisionLinks } = revisionIds.length
    ? await s.client.from('quotation_revisions')
      .select('id,quotation_id,version,project_id,created_at')
      .eq('organization_id', s.org)
      .in('id', revisionIds)
    : { data: [] };
  const revisions = new Map((revisionLinks ?? []).map((row) => [row.id, row]));
  const projectIds = [...new Set((revisionLinks ?? []).map((row) => row.project_id))];
  const quotationIds = [...new Set((revisionLinks ?? []).map((row) => row.quotation_id))];
  const { data: quoteDates } = quotationIds.length
    ? await s.client.from('quotations')
      .select('id,created_at')
      .eq('organization_id', s.org)
      .in('id', quotationIds)
    : { data: [] };
  const quoteCreatedAt = new Map((quoteDates ?? []).map((row) => [row.id, row.created_at]));
  const sharedLookup = s.client.rpc.bind(s.client) as unknown as (
    name: string, args: { p_organization_id: string; p_revision_ids: string[] },
  ) => Promise<{ data: unknown; error: unknown }>;
  const industryPromise = s.repository.industries().catch((error: unknown) => {
    console.error('[quotations:list] Industry metadata unavailable', error);
    return [] as Awaited<ReturnType<typeof s.repository.industries>>;
  });
  const [{ data: projectIndustries }, industryList, countResponse, shareResponse] =
    await Promise.all([
      projectIds.length
        ? s.client.from('projects')
          .select('id,industry_id,customer_id')
          .eq('organization_id', s.org)
          .in('id', projectIds)
        : Promise.resolve({ data: [] }),
      industryPromise,
      s.client.from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', s.org)
        .neq('status', 'cancelled'),
      revisionIds.length
        ? sharedLookup('quotation_shared_revisions', {
            p_organization_id: s.org,
            p_revision_ids: revisionIds,
          })
        : Promise.resolve({ data: [], error: null }),
    ]);
  const sharingAvailable = !shareResponse.error && Array.isArray(shareResponse.data);
  if (!sharingAvailable) console.error('[quotations:list] Sharing metadata unavailable', shareResponse.error);
  const sharedIds = new Set<string>(
    Array.isArray(shareResponse.data)
      ? shareResponse.data.filter((id): id is string => typeof id === 'string')
      : [],
  );
  const projectById = new Map((projectIndustries ?? []).map((row) => [row.id, row]));
  const industryById = new Map(industryList.map((industry) => [industry.id, industry.name]));

  type QuotationRow = (typeof rows)[number];
  const latestByQuote = new Map<string, QuotationRow>();
  for (const row of rows) {
    const parentId = revisions.get(row.id)?.quotation_id ?? row.id;
    const current = latestByQuote.get(parentId);
    if (!current || (row.revision_number ?? 0) > (current.revision_number ?? 0))
      latestByQuote.set(parentId, row);
  }
  const quotes = [...latestByQuote.values()].filter((row) =>
    viewStatus !== 'shared' || sharedIds.has(row.id),
  );
  const canCreate = s.allowed('quotation.create', 'quotation');
  const canEdit = s.allowed('quotation.edit', 'quotation');
  const canRemove = s.allowed('quotation.delete', 'quotation');
  const values = quotes.filter((row) => sharedIds.has(row.id))
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const searchUrl = (status = viewStatus, page = 1) => {
    const query = new URLSearchParams();
    if (filter.query) query.set('q', filter.query);
    if (status) query.set('status', status);
    if (page > 1) query.set('page', String(page));
    return '/dashboard/quotations' + (query.size ? '?' + query.toString() : '');
  };
  const hasMore = filter.page * 25 < data.total;
  const cards = [
    {
      label: 'Total Quotations',
      value: countResponse.error || countResponse.count === null ? '—'
        : countResponse.count.toLocaleString('en-IN'),
      note: 'Company quotations',
      icon: '▤',
      tone: 'orange',
    },
    {
      label: 'Clients Quoted',
      value: new Set(quotes.flatMap((row) => {
        const revision = revisions.get(row.id);
        const customerId = revision ? projectById.get(revision.project_id)?.customer_id : null;
        return customerId ? [customerId] : [];
      })).size.toLocaleString('en-IN'),
      note: 'On this page',
      icon: '♙',
      tone: 'purple',
    },
    {
      label: 'Shared',
      value: sharingAvailable ? quotes.filter((row) => sharedIds.has(row.id)).length.toLocaleString('en-IN') : '—',
      note: 'On this page',
      icon: '➤',
      tone: 'green',
    },
    {
      label: 'Shared Value',
      value: sharingAvailable ? currencyValue(organization.default_currency || 'INR', String(values)) : '—',
      note: 'Shared quotations on this page',
      icon: '₹',
      tone: 'blue',
    },
  ];

  const quoteItem = (row: QuotationRow) => {
    const revision = revisions.get(row.id);
    const project = revision ? projectById.get(revision.project_id) : undefined;
    const industry = project?.industry_id ? industryById.get(project.industry_id) : null;
    // Use the same premium, saved quotation HTML as Leads for every View action.
    // Download/View PDF remain the real customer PDF route, with one renderer.
    const preview = '/dashboard/quotations/' + row.id + '/preview';
    const editor = '/dashboard/quotations/' + row.id + '/studio';
    return {
      row,
      revision,
      customerId: project?.customer_id ?? 'quote:' + row.id,
      industry: industry || 'Not specified',
      // Latest quotation means newly CREATED quotation, not an old quote
      // whose revision was recently changed.
      createdAt: revision
        ? quoteCreatedAt.get(revision.quotation_id) ?? revision.created_at
        : null,
      preview, editor, shared: sharedIds.has(row.id),
    };
  };
  const visible = quotes.map(quoteItem);
  // One mobile customer card can contain multiple independent quote options.
  // Group by canonical customer ID; matching names do not imply identical people.
  type VisibleQuote = (typeof visible)[number];
  const customerGroups = new Map<string, {
    id: string; name: string; quotes: VisibleQuote[];
  }>();
  for (const quote of visible) {
    const group = customerGroups.get(quote.customerId);
    if (group) group.quotes.push(quote);
    else customerGroups.set(quote.customerId, {
      id: quote.customerId,
      name: quote.row.customer_name || 'Customer',
      quotes: [quote],
    });
  }
  // A single Final choice per canonical customer, including quotations on
  // different projects. If no one chose one, the newest active quote is Final.
  const validCustomerIds = [...customerGroups.keys()].filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id));
  const {data: finalChoices,error: finalChoiceError} = validCustomerIds.length
    ? await s.client.rpc('quotation_final_choices',{
        p_org:s.org,p_customer_ids:validCustomerIds,
      })
    : {data:{},error:null};
  if (finalChoiceError) console.error('[quotations:list] Final selection lookup unavailable', finalChoiceError);
  const manualChoices=validCustomerIds.length
    ?await s.client.rpc('quotation_final_marked' as never,{
      p_org:s.org,p_customer_ids:validCustomerIds,
     } as never):{data:{},error:null};
  if (manualChoices.error) console.error('[quotations:list] Manually pinned Final lookup unavailable', manualChoices.error);
  const manualByCustomer=manualChoices.data&&typeof manualChoices.data==='object'
    &&!Array.isArray(manualChoices.data)
    ?manualChoices.data as Record<string,unknown>:{};

  const finalByCustomer = new Map<string,string>(
    finalChoices && typeof finalChoices==='object' && !Array.isArray(finalChoices)
      ? Object.entries(finalChoices).filter((entry):entry is [string,string] =>
          typeof entry[1]==='string')
      : [],
  );
  // Final is also checked in the database on submission.
  // Hide changing the project's final quotation from other staff.
  const finalCandidateIds=[...new Set(visible.map(row=>row.revision?.quotation_id)
    .filter((id):id is string=>Boolean(id)))].slice(0,100);
  const finalPermissions=finalCandidateIds.length
    ?await s.client.rpc('quotation_final_eligible' as never,{
      p_org:s.org,p_quotation_ids:finalCandidateIds,
     } as never):{data:{},error:null};
  if (finalPermissions.error) console.error('[quotations:list] Final eligibility lookup unavailable', finalPermissions.error);
  const finalStatusAvailable = !finalChoiceError && !manualChoices.error && !finalPermissions.error;
  const finalEligibility=finalPermissions.data&&typeof finalPermissions.data==='object'
    &&!Array.isArray(finalPermissions.data)
    ?finalPermissions.data as Record<string,unknown>:{};
  const mobileCustomers = [...customerGroups.values()].map((group) => ({

    ...group,
    quotes: group.quotes.sort((a, b) =>
      (finalStatusAvailable ? Number(b.revision?.quotation_id===finalByCustomer.get(group.id)) -
      Number(a.revision?.quotation_id===finalByCustomer.get(group.id)) : 0) ||
      (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
      (b.row.quotation_number ?? '').localeCompare(a.row.quotation_number ?? '') ||
      b.row.id.localeCompare(a.row.id)),
  })).sort((a, b) =>
    (b.quotes[0]?.createdAt ?? '').localeCompare(a.quotes[0]?.createdAt ?? '') ||
    a.name.localeCompare(b.name));

  // One main card per customer. Their older quotations are preserved in the
  // expandable history and keep their own independent preview and editing actions.
  const renderMobileQuote = (
    { row, revision, customerId, industry, createdAt, preview, editor, shared }: VisibleQuote,
    history = false,
  ) => (
    <article className={'qs-quotes-mobile-quote' + (history ? ' qs-quotes-past-quote' : '')}
      key={row.id}>
      <div className="qs-quotes-mobile-top">
        <Link href={editor}>{row.quotation_number || 'Quotation'}</Link>
        {finalStatusAvailable && revision?.quotation_id===finalByCustomer.get(customerId) &&
          <span className="qs-final-label">{manualByCustomer[customerId]===revision?.quotation_id?
          '★ Final':'Latest'}</span>}
        {shared ? <span className="qs-quotes-state qs-state-shared">Shared</span> : !sharingAvailable ? <span className="qs-quotes-state">Sharing unavailable</span> : row.status === 'draft' ? <span className="qs-quotes-state">Saved</span> : null}
      </div>
      <div className="qs-quotes-mobile-meta">
        <span className="qs-quotes-service">{industry}</span>
        <strong className="qs-quotes-amount">{currencyValue(
          row.currency || organization.default_currency || 'INR', row.amount)}</strong>
      </div>
      <div className="qs-quotes-mobile-subline">
        <span>{row.project_name || 'Project'}</span>
        <span>{niceDate(createdAt)} · R{row.revision_number ?? 1}</span>
      </div>
      {finalStatusAvailable && revision && finalEligibility[revision.quotation_id]===true && manualByCustomer[customerId]!==revision.quotation_id &&
        <QuotationFinalButton quotationId={revision.quotation_id}
          number={row.quotation_number||'Quotation'}/>}
      <div className="qs-quotes-mobile-actions">
        <Link className="qs-quotes-action qs-quotes-action-view"
          href={preview} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/>
            <circle cx="12" cy="12" r="2.8"/>
          </svg>
          View
        </Link>
        {row.status === 'draft' && canEdit
          ? <Link className="qs-quotes-action qs-quote-edit" href={editor + '?step=quote'}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 17-.8 3.8L7 20l12.5-12.5-3-3L4 17Zm10.7-10.7 3 3"/>
              </svg>
              Edit
            </Link>
          : row.status === 'issued' && canCreate && revision
            ? <QuotationReviseButton revisionId={row.id} version={revision.version}
                number={row.quotation_number || 'Quotation'} />
            : <Link className="qs-quotes-action" href={editor}>Open</Link>}
        <QuotationMobileMore>
          <Link href={'/dashboard/quotations/' + row.id + '/pdf'}>
            Download PDF
          </Link>
          {canRemove && row.status === 'draft' && revision &&
            <QuotationRemovalButton id={row.id}
              number={row.quotation_number || 'Quotation'}
              version={revision.version} issued={false} />}
        </QuotationMobileMore>
      </div>
    </article>
  );

  const renderTableRow = (
    { row, revision, customerId, industry, createdAt, preview, editor, shared }: VisibleQuote,
  ) => <tr key={row.id}>
    <td className="qs-quotes-no">
      <Link href={editor}>{row.quotation_number || 'Quotation'}</Link>
      {finalStatusAvailable && revision?.quotation_id===finalByCustomer.get(customerId) &&
        <span className="qs-final-label">{manualByCustomer[customerId]===revision?.quotation_id?
          '★ Final':'Latest'}</span>}
      <small>Revision {row.revision_number ?? 1}</small>
    </td>
    <td>
      <div className="qs-quotes-client">
        <span className="qs-quotes-initials">{initials(row.customer_name || 'Customer')}</span>
        <div>
          <strong>{row.customer_name || 'Customer'}</strong>
          <small>{row.project_name || 'Project'}</small>
        </div>
      </div>
    </td>
    <td><span className={'qs-quotes-service ' +
      (/construction/i.test(industry) ? 'qs-service-construction'
        : /interior/i.test(industry) ? 'qs-service-interior' : 'qs-service-other')}>
      {industry}
    </span></td>
    <td className="qs-quotes-amount">{currencyValue(
      row.currency || organization.default_currency || 'INR', row.amount)}</td>
    <td>{shared
      ? <span className="qs-quotes-state qs-state-shared">Shared</span>
      : !sharingAvailable ? <span className="qs-quotes-unshared">Sharing unavailable</span>
       : <span className="qs-quotes-unshared">{row.status === 'draft' ? 'Saved' : 'Not shared'}</span>}</td>
    <td className="qs-quotes-created">{niceDate(createdAt)}</td>
    <td>
      <div className="qs-quotes-actions">
        <Link href={preview} target="_blank" rel="noopener noreferrer"
          aria-label={'Preview ' + (row.quotation_number || 'quotation')}
          title="Preview quotation" className="qs-quote-icon-button">◉</Link>
        {row.status === 'draft' && canEdit && <Link className="qs-quote-edit" href={editor + '?step=quote'}
          aria-label={'Edit ' + (row.quotation_number || 'quotation')}>✎ Edit</Link>}
        {row.status === 'issued' && canCreate && revision &&
          <QuotationReviseButton revisionId={row.id} version={revision.version}
            number={row.quotation_number || 'Quotation'} />}
        {finalStatusAvailable && revision && finalEligibility[revision.quotation_id]===true && manualByCustomer[customerId]!==revision.quotation_id &&
          <QuotationFinalButton quotationId={revision.quotation_id}
            number={row.quotation_number||'Quotation'}/>}
        <details className="qs-quotes-more">
          <summary aria-label={'More options for ' + (row.quotation_number || 'quotation')}>•••</summary>
          <div>
            {row.status !== 'draft' && <Link href={editor}>Open quotation</Link>}
            <Link href={'/dashboard/quotations/' + row.id + '/pdf?view=1'}
              target="_blank" rel="noopener noreferrer">View PDF</Link>
            {canRemove && row.status === 'draft' && revision &&
              <QuotationRemovalButton id={row.id}
                number={row.quotation_number || 'Quotation'}
                version={revision.version} issued={false} />}
          </div>
        </details>
      </div>
    </td>
  </tr>;

  return (
    <QuotationStudioFrame companyName={organization.name} accountEmail={user.email ?? ''}>
      <div className="qs-quotes-page">
        <div className="qs-quotes-heading">
          <div className="qs-quotes-identity">
            <span className="qs-quotes-title-icon" aria-hidden="true">▤</span>
            <div>
              <h1>Quotations</h1>
              <p>Manage your created quotations, preview documents and track progress.</p>
            </div>
          </div>
          {canCreate && <Link className="qs-quotes-create" href="/dashboard/quotations/new">
            <span aria-hidden="true">＋</span> Create New Quote
          </Link>}
        </div>

        {(!sharingAvailable || !finalStatusAvailable) && <p role="status" className="qs-quotes-lookup-warning">
           Some sharing or Final-selection details are unavailable. Your saved quotations remain accessible,
           and no Final choice has been changed.
         </p>}
         <section className="qs-quotes-kpis" aria-label="Quotation overview">
          {cards.map((card) => <div className="qs-quotes-kpi" key={card.label}>
            <span className={'qs-quotes-kpi-icon qs-quotes-kpi-' + card.tone}>{card.icon}</span>
            <div>
              <h2>{card.label}</h2>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          </div>)}
        </section>

        <section className="qs-quotes-list" aria-label="Saved quotations">
          <nav className="qs-quotes-tabs" aria-label="Quotation status">
            {statusTabs.map((tab) => <Link key={tab.status}
              className={viewStatus === tab.status ? 'qs-quotes-tab qs-quotes-tab-active' : 'qs-quotes-tab'}
              href={searchUrl(tab.status)}>
              {tab.label}
            </Link>)}
          </nav>
          <form className="qs-quotes-filters" method="get" action="/dashboard/quotations">
            <label className="qs-quotes-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" name="q" defaultValue={filter.query}
                placeholder="Search client, project, quote number…"
                aria-label="Search quotations"/>
            </label>
            <label className="qs-quotes-status-filter">
              <span className="sr-only">Quotation status</span>
              <select name="status" defaultValue={viewStatus}>
                <option value="">All quotations</option>
                <option value="shared">Shared</option>
              </select>
            </label>
            <button type="submit" className="qs-quotes-apply">Filter</button>
            {(filter.query || viewStatus) && <Link className="qs-quotes-clear" href="/dashboard/quotations">
              Clear
            </Link>}
          </form>

          {visible.length > 0 ? <>
            <div className="qs-quotes-table-wrap">
              <table className="qs-quotes-table">
                <thead><tr>
                  <th>Quote No.</th>
                  <th>Client &amp; Project</th>
                  <th>Service Type</th>
                  <th>Amount</th>
                  <th>Sharing</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr></thead>
                <tbody>{mobileCustomers.map((group) => (
                  <Fragment key={group.id}>
                    {renderTableRow(group.quotes[0]!)}
                    {group.quotes.length > 1 && <tr className="qs-quotes-history-row">
                      <td colSpan={7}>
                        <details className="qs-quotes-history">
                          <summary>View all quotations ({group.quotes.length}) <span aria-hidden="true">⌄</span></summary>
                          <div className="qs-quotes-history-table-wrap">
                            <table className="qs-quotes-table qs-quotes-history-table">
                              <tbody>{group.quotes.slice(1).map((quote) => renderTableRow(quote))}</tbody>
                            </table>
                          </div>
                        </details>
                      </td>
                    </tr>}
                  </Fragment>
                ))}</tbody>
              </table>
            </div>
            <div className="qs-quotes-mobile-list">
              {mobileCustomers.map((group) => (
                <section className="qs-quotes-customer-card" key={group.id}
                  aria-label={group.name + ' quotations'}>
                  <header className="qs-quotes-customer-header">
                    <span className="qs-quotes-initials">{initials(group.name)}</span>
                    <div className="qs-quotes-customer-name">
                      <strong>{group.name}</strong>
                      <small>{group.quotes.length} quotation{group.quotes.length === 1 ? '' : 's'}</small>
                    </div>
                  </header>
                  {renderMobileQuote(group.quotes[0]!)}
                  <QuotationMobileFooter count={group.quotes.length}
                    pdfHref={'/dashboard/quotations/' + group.quotes[0]!.row.id + '/pdf?view=1'}>
                    {group.quotes.slice(1).map((quote) => renderMobileQuote(quote, true))}
                  </QuotationMobileFooter>
                </section>
              ))}
            </div>
          </> : <div className="qs-quotes-empty">
            <span aria-hidden="true">▤</span>
            <h2>{filter.query || viewStatus ? 'No matching quotations' : 'No quotations yet'}</h2>
            <p>{filter.query || viewStatus
              ? 'Try another search or status.'
              : 'Your saved quotations will appear here after creation.'}</p>
            {canCreate && <Link className="qs-quotes-create" href="/dashboard/quotations/new">
              Create New Quote
            </Link>}
          </div>}

          <footer className="qs-quotes-footer">
            <span>{mobileCustomers.length} customer{mobileCustomers.length === 1 ? '' : 's'} on this page
              {' · '}Page {filter.page}

            </span>
            <div>
              {filter.page > 1 && <Link href={searchUrl(filter.status, filter.page - 1)}
                aria-label="Previous page">← Previous</Link>}
              <span className="qs-quotes-current">{filter.page}</span>
              {hasMore && <Link href={searchUrl(filter.status, filter.page + 1)}
                aria-label="Next page">Next →</Link>}
            </div>
          </footer>
        </section>
      </div>
    </QuotationStudioFrame>
  );
}
