import Link from 'next/link';
import {
  commercialSearchResultSchema,
  searchSchema,
} from '@business-os/core/commercial';
import { commercialServices } from '../commercial/service';
import { QuotationStudioFrame } from './studio-frame';
import { QuotationRemovalButton } from './quotation-removal-button';
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

function statusName(value: string) {
  switch (value) {
    case 'issued': return 'Shared';
    case 'draft': return 'Draft';
    case 'superseded': return 'Superseded';
    case 'cancelled': return 'Cancelled';
    default: return value.replaceAll('_', ' ');
  }
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
  { label: 'Draft', status: 'draft' },
  { label: 'Shared', status: 'shared' },
] as const;

export default async function Quotations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const p = await searchParams;
  const viewStatus = p.status === 'draft' || p.status === 'shared' ? p.status : '';
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
  const data = commercialSearchResultSchema.parse(result);
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
  const sharedLookup = s.client.rpc.bind(s.client) as unknown as (
    name: string, args: { p_organization_id: string; p_revision_ids: string[] },
  ) => Promise<{ data: unknown; error: unknown }>;
  const [{ data: projectIndustries }, industryList, countResponse, shareResponse] =
    await Promise.all([
      projectIds.length
        ? s.client.from('projects')
          .select('id,industry_id')
          .eq('organization_id', s.org)
          .in('id', projectIds)
        : Promise.resolve({ data: [] }),
      s.repository.industries(),
      s.client.from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', s.org),
      revisionIds.length
        ? sharedLookup('quotation_shared_revisions', {
            p_organization_id: s.org,
            p_revision_ids: revisionIds,
          })
        : Promise.resolve({ data: [], error: null }),
    ]);
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
      label: 'Drafts',
      value: quotes.filter((row) => row.status === 'draft').length.toLocaleString('en-IN'),
      note: 'On this page',
      icon: '◷',
      tone: 'purple',
    },
    {
      label: 'Shared',
      value: quotes.filter((row) => sharedIds.has(row.id)).length.toLocaleString('en-IN'),
      note: 'On this page',
      icon: '➤',
      tone: 'green',
    },
    {
      label: 'Shared Value',
      value: currencyValue(organization.default_currency || 'INR', String(values)),
      note: 'Shared quotations on this page',
      icon: '₹',
      tone: 'blue',
    },
  ];

  const quoteItem = (row: QuotationRow) => {
    const revision = revisions.get(row.id);
    const project = revision ? projectById.get(revision.project_id) : undefined;
    const industry = project?.industry_id ? industryById.get(project.industry_id) : null;
    const preview = '/dashboard/quotations/' + row.id + '/preview';
    const editor = '/dashboard/quotations/' + row.id + '/studio';
    return {
      row,
      revision,
      industry: industry || 'Not specified',
      createdAt: revision?.created_at ?? null,
      preview, editor, shared: sharedIds.has(row.id),
    };
  };
  const visible = quotes.map(quoteItem);

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
                <option value="draft">Draft</option>
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
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr></thead>
                <tbody>{visible.map(({ row, revision, industry, createdAt, preview, editor, shared }) => (
                  <tr key={row.id}>
                    <td className="qs-quotes-no">
                      <Link href={editor}>{row.quotation_number || 'Quotation'}</Link>
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
                    <td><span className={'qs-quotes-state qs-state-' + (shared ? 'shared' : row.status)}>{row.status === 'issued' && !shared ? 'Ready to share' : statusName(row.status)}</span></td>
                    <td className="qs-quotes-created">{niceDate(createdAt)}</td>
                    <td>
                      <div className="qs-quotes-actions">
                        <Link href={preview} target="_blank" rel="noopener noreferrer"
                          aria-label={'Preview ' + (row.quotation_number || 'quotation')}
                          title="Preview quotation" className="qs-quote-icon-button">◉</Link>
                        {row.status === 'draft' && <Link className="qs-quote-edit" href={editor + '?step=quote'}
                          aria-label={'Edit ' + (row.quotation_number || 'quotation')}>✎ Edit</Link>}
                        <Link href={editor + '?step=preview'}
                          aria-label={'Review and share ' + (row.quotation_number || 'quotation')}
                          title="Review and share in Quotation Studio" className="qs-quote-icon-button">➤</Link>
                        <details className="qs-quotes-more">
                          <summary aria-label={'More options for ' + (row.quotation_number || 'quotation')}>•••</summary>
                          <div>
                            <Link href={editor}>{row.status === 'draft' ? 'Edit quotation' : 'Open quotation'}</Link>
                            <Link href={'/dashboard/quotations/' + row.id + '/pdf?view=1'}
                              target="_blank" rel="noopener noreferrer">View PDF</Link>
                            {canRemove && (row.status === 'draft' || row.status === 'issued') &&
                              revision && (
                                <QuotationRemovalButton id={row.id}
                                  number={row.quotation_number || 'Quotation'}
                                  version={revision.version}
                                  issued={row.status === 'issued'}/>
                              )}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="qs-quotes-mobile-list">
              {visible.map(({ row, revision, industry, createdAt, preview, editor, shared }) => (
                <article className="qs-quotes-mobile-card" key={row.id}>
                  <div className="qs-quotes-mobile-top">
                    <Link href={editor}>{row.quotation_number || 'Quotation'}</Link>
                    <span className={'qs-quotes-state qs-state-' + (shared ? 'shared' : row.status)}>{row.status === 'issued' && !shared ? 'Ready to share' : statusName(row.status)}</span>
                  </div>
                  <div className="qs-quotes-mobile-person">
                    <span className="qs-quotes-initials">{initials(row.customer_name || 'Customer')}</span>
                    <div><strong>{row.customer_name || 'Customer'}</strong>
                      <small>{row.project_name || 'Project'}</small></div>
                    <strong className="qs-quotes-amount">{currencyValue(
                      row.currency || organization.default_currency || 'INR', row.amount)}</strong>
                  </div>
                  <div className="qs-quotes-mobile-meta">
                    <span className="qs-quotes-service">{industry}</span>
                    <span>{niceDate(createdAt)} · R{row.revision_number ?? 1}</span>
                  </div>
                  <div className="qs-quotes-mobile-actions">
                    <Link href={preview} target="_blank" rel="noopener noreferrer">◉ View</Link>
                    {row.status === 'draft'
                      ? <Link className="qs-quote-edit" href={editor + '?step=quote'}>✎ Edit</Link>
                      : <Link href={editor}>Open</Link>}
                    <Link href={editor + '?step=preview'}>➤ Share</Link>
                    <details className="qs-quotes-mobile-more">
                      <summary>••• More</summary>
                      <div>
                        <Link href={editor}>{row.status === 'draft' ? 'Edit quotation' : 'Open quotation'}</Link>
                        <Link href={'/dashboard/quotations/' + row.id + '/pdf?view=1'}
                          target="_blank" rel="noopener noreferrer">View PDF</Link>
                        {canRemove && (row.status === 'draft' || row.status === 'issued') &&
                          revision && <QuotationRemovalButton id={row.id}
                            number={row.quotation_number || 'Quotation'}
                            version={revision.version}
                            issued={row.status === 'issued'}/>}
                      </div>
                    </details>
                  </div>
                </article>
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
            <span>{visible.length} quotation{visible.length === 1 ? '' : 's'} on this page
              {' · '}Page {filter.page}
              {data.total ? ' · ' + data.total.toLocaleString('en-IN') + ' matching revision records' : ''}
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
