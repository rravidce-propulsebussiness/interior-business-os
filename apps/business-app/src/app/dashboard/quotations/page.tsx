import Link from 'next/link';
import {
  commercialSearchResultSchema,
  searchSchema,
} from '@business-os/core/commercial';
import { commercialServices } from '../commercial/service';
import { QuotationStudioFrame } from './studio-frame';

export const dynamic = 'force-dynamic';

export default async function Quotations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const p = await searchParams;
  const filter = searchSchema.parse({
    query: p.q ?? '',
    page: Math.min(10000, Math.max(1, Number.parseInt(p.page || '1', 10) || 1)),
    status: p.status ?? '',
    parent_id: null,
  });
  const s = await commercialServices('quotation.view', 'quotation', true);
  const [result, organization, user, quoteSettings] = await Promise.all([
    s.commercial.search(
      s.org,
      'quotations',
      filter.query,
      filter.page,
      filter.status,
    ),
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.client
      .from('organization_quotation_settings')
      .select('id')
      .eq('organization_id', s.org)
      .maybeSingle(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const rows = commercialSearchResultSchema.parse(result).rows;
  const total = commercialSearchResultSchema.parse(result).total;
  // Search results are revisions. Resolve their parent quotation/customer and
  // present one CRN workspace per customer, keeping every historical revision.
  const revisionIds = rows.map((row) => row.id);
  const { data: revisionLinks } = revisionIds.length
    ? await s.client
        .from('quotation_revisions')
        .select('id,quotation_id')
        .eq('organization_id', s.org)
        .in('id', revisionIds)
    : { data: [] };
  const quotationIds = [
    ...new Set((revisionLinks ?? []).map((r) => r.quotation_id)),
  ];
  const { data: parentQuotes } = quotationIds.length
    ? await s.client
        .from('quotations')
        .select('id,customer_id')
        .eq('organization_id', s.org)
        .in('id', quotationIds)
    : { data: [] };
  const revisionToQuote = new Map(
    (revisionLinks ?? []).map((revision) => [
      revision.id,
      revision.quotation_id,
    ]),
  );
  const quoteToCustomer = new Map(
    (parentQuotes ?? []).map((quote) => [quote.id, quote.customer_id]),
  );
  type QuotationRow = (typeof rows)[number];
  const groupedMap = new Map<
    string,
    { customerId: string | null; name: string; rows: QuotationRow[] }
  >();
  for (const row of rows) {
    const customerId =
      quoteToCustomer.get(revisionToQuote.get(row.id) ?? '') ?? null;
    // If a legacy row cannot be resolved, isolate it rather than incorrectly
    // grouping quotations from different customers.
    const groupId = customerId ?? row.id;
    const found = groupedMap.get(groupId);
    if (found) {
      found.rows.push(row);
    } else {
      groupedMap.set(groupId, {
        customerId,
        name: row.customer_name || 'Customer',
        rows: [row],
      });
    }
  }
  const groupedCustomers = [...groupedMap.values()];
  const draftCount = rows.filter((r) => r.status === 'draft').length;
  const issuedCount = rows.filter((r) => r.status === 'issued').length;
  const activeTotal = rows
    .filter((r) => r.status === 'issued')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: organization.default_currency || 'INR',
    maximumFractionDigits: 0,
  });

  return (
    <QuotationStudioFrame
      companyName={organization.name}
      accountEmail={user.email ?? ''}
    >
      <div className="qs-heading">
        <div className="qs-heading-label">
          <span className="qs-heading-icon">▤</span>
          <div>
            <h1>Quotation Studio</h1>
            <p>Beautiful, accurate, branded proposals for every project.</p>
          </div>
        </div>
        <div className="qs-toolbar">
          {s.allowed('settings.manage', 'quotation') && (
            <Link className="qs-btn" href="/dashboard/quotations/settings">
              ⚙ Company branding
            </Link>
          )}
          <Link className="qs-btn" href="/dashboard/quotations/packages">
            ▦ Package Manager
          </Link>
          {s.allowed('quotation.create', 'quotation') && (
            <Link className="qs-btn primary" href="/dashboard/quotations/new">
              ＋ Create Quotation
            </Link>
          )}
        </div>
      </div>

      <div className="qs-kpi-grid">
        {[
          {
            name: 'Quotation revisions',
            value: total.toLocaleString('en-IN'),
            note: 'Current search',
          },
          {
            name: 'Drafts / Issued',
            value: draftCount + ' / ' + issuedCount,
            note: 'Shown on this page',
          },
          {
            name: 'Issued value',
            value: formatted.format(activeTotal),
            note: 'Shown on this page',
          },
        ].map((item) => (
          <div className="qs-kpi" key={item.name}>
            <label>{item.name}</label>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
      <div className="qs-create-grid">
        <section className="qs-card">
          <div className="qs-heading">
            <div>
              <h2>All company quotations</h2>
              <p className="qs-muted">
                One customer CRN with all their projects, quotations and
                revisions.
              </p>
            </div>
            <span className="qs-selected-pill">
              {groupedCustomers.length} customers · {total} revisions
            </span>
          </div>
          <form
            method="get"
            action="/dashboard/quotations"
            className="qs-fields qs-quote-filters"
          >
            <label className="qs-field">
              Search quote number
              <input
                name="q"
                defaultValue={filter.query}
                placeholder="e.g. Q-2026-000001"
              />
            </label>
            <label className="qs-field">
              Status
              <select name="status" defaultValue={filter.status}>
                <option value="">All statuses</option>
                <option value="draft">Drafts</option>
                <option value="issued">Issued</option>
                <option value="superseded">Superseded</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <button
              type="submit"
              className="qs-btn primary"
              style={{ alignSelf: 'end' }}
            >
              Filter
            </button>
          </form>
          {rows.length ? (
            <div className="qs-quotation-list">
              {groupedCustomers.map((customer) => {
                const crn = customer.customerId
                  ? 'CRN-' +
                    customer.customerId
                      .replaceAll('-', '')
                      .slice(0, 12)
                      .toUpperCase()
                  : 'Legacy quotation';
                const projects = new Set(
                  customer.rows.map((row) => row.project_name),
                );
                const quoteNumbers = new Set(
                  customer.rows.map((row) => row.quotation_number),
                );
                return (
                  <section
                    className="qs-customer-group"
                    key={
                      customer.customerId ??
                      customer.rows[0]?.id ??
                      customer.name
                    }
                  >
                    <div className="qs-customer-header">
                      <div>
                        <span className="qs-selected-pill">{crn}</span>
                        <h3>{customer.name}</h3>
                        <p>
                          {projects.size} project(s) · {quoteNumbers.size}{' '}
                          quotation(s) · {customer.rows.length} revision(s) on
                          this page
                        </p>
                      </div>
                      {customer.customerId && (
                        <Link
                          className="qs-btn"
                          href={'/dashboard/customers/' + customer.customerId}
                        >
                          View customer →
                        </Link>
                      )}
                    </div>
                    <div className="qs-quotation-list">
                      {customer.rows.map((row) => (
                        <Link
                          key={row.id}
                          href={'/dashboard/quotations/' + row.id + '/studio'}
                          className="qs-quotation-item"
                        >
                          <div>
                            <strong>
                              {row.quotation_number || 'Quotation'}
                            </strong>
                            <small>
                              {row.project_name || 'Project'} · Revision{' '}
                              {row.revision_number ?? 1}
                            </small>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span className="qs-badge">
                              {row.status || 'draft'}
                            </span>
                            <strong style={{ marginTop: 7 }}>
                              {row.currency} {row.amount ?? '0'}
                            </strong>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="qs-empty-preview">
              <span className="qs-heading-icon">▤</span>
              <strong>
                {filter.query || filter.status
                  ? 'No matching quotations'
                  : 'Your first beautiful quotation starts here'}
              </strong>
              <p className="qs-muted">
                Start from a client, choose Construction or Interiors, price by
                SFT or custom BOQ, and share a company-branded PDF.
              </p>
              <Link className="qs-btn primary" href="/dashboard/quotations/new">
                + Create First Quotation
              </Link>
            </div>
          )}
          <div
            className="qs-toolbar"
            style={{ justifyContent: 'space-between', marginTop: 17 }}
          >
            {filter.page > 1 ? (
              <Link
                className="qs-btn"
                href={
                  '/dashboard/quotations?page=' +
                  (filter.page - 1) +
                  '&q=' +
                  encodeURIComponent(filter.query) +
                  '&status=' +
                  filter.status
                }
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {filter.page * 25 < total && (
              <Link
                className="qs-btn"
                href={
                  '/dashboard/quotations?page=' +
                  (filter.page + 1) +
                  '&q=' +
                  encodeURIComponent(filter.query) +
                  '&status=' +
                  filter.status
                }
              >
                Next →
              </Link>
            )}
          </div>
        </section>
        <aside className="qs-editor">
          <section className="qs-create-hero">
            <p
              style={{ letterSpacing: '.14em', fontWeight: 800, fontSize: 11 }}
            >
              YOUR COMPANY · YOUR BRAND
            </p>
            <h2 style={{ marginTop: 14 }}>
              From estimate to signature, beautifully.
            </h2>
            <p>
              Create construction floor-wise SFT proposals or interior room-wise
              L × B estimates. Choose your company&apos;s packages, brands, PDF
              annexures, discounts and payment terms.
            </p>
            <div
              style={{
                marginTop: 24,
                padding: 19,
                borderRadius: 10,
                background: '#ffffff19',
                border: '1px solid #ffffff35',
              }}
            >
              <strong style={{ fontSize: 17 }}>{organization.name}</strong>
              <p>
                Professional quotation · Client details · Cost breakdown ·
                Materials · Terms
              </p>
            </div>
            <Link
              href="/dashboard/quotations/new"
              className="qs-btn"
              style={{ marginTop: 22, background: 'white', color: '#1a55bb' }}
            >
              Open Quote Builder →
            </Link>
          </section>
          {!quoteSettings.data && (
            <div className="qs-warning">
              This company still needs quotation-branding settings. Defaults are
              provisioned automatically after the latest database migration.
              <Link
                href="/dashboard/quotations/settings"
                className="ml-2 underline font-bold"
              >
                Set branding
              </Link>
            </div>
          )}
          <div className="qs-card">
            <h2>Included quotation capabilities</h2>
            <div className="qs-info-box">
              ▦ Construction — SFT, floor prices, material packages.
            </div>
            <div className="qs-info-box" style={{ marginTop: 8 }}>
              ▤ Interiors — room BOQ, L × B, plywood, laminate, glass and
              hardware.
            </div>
            <div className="qs-info-box" style={{ marginTop: 8 }}>
              ⇧ Append existing PDFs, preview, issue and share.
            </div>
          </div>
        </aside>
      </div>
    </QuotationStudioFrame>
  );
}
