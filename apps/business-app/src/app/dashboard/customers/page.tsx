import Link from 'next/link';
import { canAccess } from '@business-os/auth';
import { commercialServices } from '../commercial/service';
import { OwnerShell, OwnerIcon } from '../owner-shell';
import { projectWorkspaceNavigation } from '../projects/project-workspace-navigation';
import { leadServiceFromIndustryKey } from '../crm/leads/lead-service-options';
import '../owner-dashboard.css';
import './clients-directory.css';

export const dynamic = 'force-dynamic';

type Query = { q?: string; page?: string; status?: string; service?: string };
type Client = {
  id: string;
  display_name: string;
  phone: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
  billing_address: unknown;
};
const PAGE_SIZE = 25;

function safePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) ? Math.min(10000, Math.max(1, page)) : 1;
}
function initials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'C'
  );
}
function city(address: unknown): string {
  if (!address || typeof address !== 'object' || Array.isArray(address))
    return '';
  const value = (address as Record<string, unknown>).city;
  return typeof value === 'string' ? value.trim() : '';
}
function dateText(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
function normalizedPhone(value: string): string {
  return value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}
function keyForCustomer(row: Client): string[] {
  const phone = normalizedPhone(row.phone);
  const email = row.email.trim().toLowerCase();
  return [
    phone.length >= 10 ? 'p:' + phone : '',
    email ? 'e:' + email : '',
  ].filter(Boolean);
}

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const s = await commercialServices('customer.view', 'customers', true);
  const params = await searchParams;
  const q = (params.q ?? '')
    .trim()
    .slice(0, 70)
    .replace(/["\\,()%]/g, '');
  const status =
    params.status === 'active' || params.status === 'inactive'
      ? params.status
      : 'all';
  const service =
    params.service === 'construction' || params.service === 'interior'
      ? params.service
      : 'all';
  const page = safePage(params.page);
  const has = (permission: string, moduleKey?: string) =>
    canAccess(s.context, {
      organizationId: s.org,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  const canProjects = has('project.view', 'projects');
  const canQuotes = has('quotation.view', 'quotation');
  const canBilling = has('financial_report.view', 'billing');
  const [
    organization,
    user,
    plans,
    counts,
    active,
    projectTotal,
    quoteTotal,
    industries,
  ] = await Promise.all([
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.plans().catch(() => []),
    s.client
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', s.org)
      .eq('is_sales_prospect', false),
    s.client
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', s.org)
      .eq('is_sales_prospect', false)
      .eq('status', 'active'),
    canProjects
      ? s.client
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', s.org)
      .eq('is_sales_prospect', false)
      : Promise.resolve({ count: null }),
    canQuotes
      ? s.client
          .from('quotations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', s.org)
      : Promise.resolve({ count: null }),
    s.repository.industries(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');

  const industryIds = industries
    .filter((row) => leadServiceFromIndustryKey(row.key) === service)
    .map((row) => row.id);
  let allowedCustomerIds: string[] | null = null;
  if (service !== 'all') {
    if (!canProjects || !industryIds.length) {
      allowedCustomerIds = [];
    } else {
      const matches = await s.client
        .from('projects')
        .select('customer_id')
        .eq('organization_id', s.org)
      .eq('is_sales_prospect', false)
        .in('industry_id', industryIds)
        .limit(10000);
      if (matches.error) throw new Error('Could not filter client services');
      allowedCustomerIds = [
        ...new Set((matches.data ?? []).map((p) => p.customer_id)),
      ];
    }
  }
  let rows: Client[] = [];
  let total = 0;
  if (allowedCustomerIds === null || allowedCustomerIds.length) {
    let query = s.client
      .from('customers')
      .select(
        'id,display_name,phone,email,status,created_at,updated_at,billing_address',
        { count: 'exact' },
      )
      .eq('organization_id', s.org)
      .eq('is_sales_prospect', false);
    if (q) {
      // Supabase/PostgREST string literals are quoted and punctuation removed
      // so a user-supplied search never introduces a new filter expression.
      const term = '"%' + q + '%"';
      query = query.or(
        'display_name.ilike.' +
          term +
          ',phone.ilike.' +
          term +
          ',email.ilike.' +
          term,
      );
    }
    if (status !== 'all') query = query.eq('status', status);
    if (allowedCustomerIds) query = query.in('id', allowedCustomerIds);
    const result = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (result.error) throw new Error('Client directory unavailable');
    rows = result.data ?? [];
    total = result.count ?? 0;
  }
  const ids = rows.map((row) => row.id);
  const [linkedProjects, linkedQuotes] = await Promise.all([
    canProjects && ids.length
      ? s.client
          .from('projects')
          .select('id,customer_id,industry_id,created_at')
          .eq('organization_id', s.org)
      .eq('is_sales_prospect', false)
          .in('customer_id', ids)
          .limit(5000)
      : Promise.resolve({ data: [] }),
    canQuotes && ids.length
      ? s.client
          .from('quotations')
          .select('id,customer_id,created_at')
          .eq('organization_id', s.org)
          .in('customer_id', ids)
          .limit(5000)
      : Promise.resolve({ data: [] }),
  ]);
  const projects = linkedProjects.data ?? [];
  const quotations = linkedQuotes.data ?? [];
  const relatedProjects = new Map<string, number>();
  const relatedQuotes = new Map<string, number>();
  const customerServices = new Map<string, Set<'construction' | 'interior'>>();
  const activity = new Map<string, string>();
  for (const project of projects) {
    relatedProjects.set(
      project.customer_id,
      (relatedProjects.get(project.customer_id) ?? 0) + 1,
    );
    const industry = industries.find(
      (value) => value.id === project.industry_id,
    );
    const industryService = industry
      ? leadServiceFromIndustryKey(industry.key)
      : null;
    if (industryService) {
      const set =
        customerServices.get(project.customer_id) ??
        new Set<'construction' | 'interior'>();
      set.add(industryService);
      customerServices.set(project.customer_id, set);
    }
    if (
      !activity.has(project.customer_id) ||
      activity.get(project.customer_id)! < project.created_at
    )
      activity.set(project.customer_id, project.created_at);
  }
  for (const quotation of quotations) {
    relatedQuotes.set(
      quotation.customer_id,
      (relatedQuotes.get(quotation.customer_id) ?? 0) + 1,
    );
    if (
      !activity.has(quotation.customer_id) ||
      activity.get(quotation.customer_id)! < quotation.created_at
    )
      activity.set(quotation.customer_id, quotation.created_at);
  }
  const duplicateCounts = new Map<string, number>();
  for (const row of rows)
    for (const key of keyForCustomer(row))
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  const paramsHref = (next: Partial<Query>) => {
    const data = new URLSearchParams();
    const merged = { q, status, service, page: String(page), ...next };
    if (merged.q) data.set('q', merged.q);
    if (merged.status !== 'all') data.set('status', merged.status ?? 'all');
    if (merged.service !== 'all') data.set('service', merged.service ?? 'all');
    if (Number(merged.page) > 1) data.set('page', String(merged.page));
    return '/dashboard/customers' + (data.size ? '?' + data.toString() : '');
  };
  const nav = projectWorkspaceNavigation(has);
  const accountEmail = user.email ?? '';

  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={accountEmail.split('@')[0] || 'Team member'}
      accountEmail={accountEmail}
      planLabel={
        plans.find((item) => item.id === organization.plan_id)?.name ??
        'Business plan'
      }
      navigation={nav}
      search={q}
      currentHref="/dashboard/customers"
      notificationsEnabled={has('notification.view')}
    >
      <main className="clients-page" id="main-content">
        <nav className="clients-breadcrumb" aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>
          <span>›</span>
          <strong>Clients</strong>
        </nav>
        <div className="clients-heading">
          <div>
            <h1>Clients</h1>
            <p>One client account for quotations, projects and payments.</p>
          </div>
          {has('lead.create', 'crm') && (
            <Link
              className="clients-button primary"
              href="/dashboard/crm/leads/new"
            >
              <OwnerIcon name="plus" size={17} /> New lead
            </Link>
          )}
        </div>
        <section className="clients-stats" aria-label="Client statistics">
          <div className="clients-stat">
            <span className="clients-stat-icon blue">
              <OwnerIcon name="clients" />
            </span>
            <div>
              <small>Total clients</small>
              <strong>{counts.count ?? '—'}</strong>
            </div>
          </div>
          <div className="clients-stat">
            <span className="clients-stat-icon green">
              <OwnerIcon name="check" />
            </span>
            <div>
              <small>Active clients</small>
              <strong>{active.count ?? '—'}</strong>
            </div>
          </div>
          <div className="clients-stat">
            <span className="clients-stat-icon purple">
              <OwnerIcon name="projects" />
            </span>
            <div>
              <small>Projects</small>
              <strong>{canProjects ? (projectTotal.count ?? 0) : '—'}</strong>
            </div>
          </div>
          <div className="clients-stat">
            <span className="clients-stat-icon amber">
              <OwnerIcon name="quotations" />
            </span>
            <div>
              <small>Quotations</small>
              <strong>{canQuotes ? (quoteTotal.count ?? 0) : '—'}</strong>
            </div>
          </div>
        </section>
        <section className="clients-directory" aria-label="Client directory">
          <form
            className="clients-filter"
            action="/dashboard/customers"
            method="get"
          >
            <label className="clients-search-label">
              <OwnerIcon name="search" size={17} />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search name, phone or email"
                aria-label="Search clients"
              />
            </label>
            <select
              name="status"
              aria-label="Filter status"
              defaultValue={status}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              name="service"
              aria-label="Filter project service"
              defaultValue={service}
              disabled={!canProjects}
            >
              <option value="all">All services</option>
              <option value="construction">Construction</option>
              <option value="interior">Interiors</option>
            </select>
            <button className="clients-button secondary" type="submit">
              Search
            </button>
            <Link className="clients-filter-clear" href="/dashboard/customers">
              Clear
            </Link>
          </form>
          <nav className="clients-tabs" aria-label="Client status">
            <Link
              aria-current={status === 'all' ? 'page' : undefined}
              href={paramsHref({ status: 'all', page: '1' })}
            >
              All clients
            </Link>
            <Link
              aria-current={status === 'active' ? 'page' : undefined}
              href={paramsHref({ status: 'active', page: '1' })}
            >
              Active
            </Link>
            <Link
              aria-current={status === 'inactive' ? 'page' : undefined}
              href={paramsHref({ status: 'inactive', page: '1' })}
            >
              Inactive
            </Link>
          </nav>
          {!rows.length ? (
            <div className="clients-empty">
              <OwnerIcon name="clients" size={32} />
              <h2>No clients found</h2>
              <p>
                Clients appear after a Closed–Won lead is converted. Review the
                filters or go to Leads.
              </p>
              <Link
                href="/dashboard/crm/leads"
                className="clients-button secondary"
              >
                Open leads
              </Link>
            </div>
          ) : (
            <div className="clients-cards">
              {rows.map((customer) => {
                const badges = [...(customerServices.get(customer.id) ?? [])];
                const possibleDuplicate = keyForCustomer(customer).some(
                  (key) => (duplicateCounts.get(key) ?? 0) > 1,
                );
                const href = '/dashboard/customers/' + customer.id;
                const place = city(customer.billing_address);
                return (
                  <article className="clients-card" key={customer.id}>
                    <div className="clients-card-heading">
                      <span className="clients-avatar" aria-hidden="true">
                        {initials(customer.display_name)}
                      </span>
                      <div className="clients-identity">
                        <h2>
                          <Link href={href}>{customer.display_name}</Link>
                        </h2>
                        <small>{place || 'Location not specified'}</small>
                      </div>
                      <span
                        className={
                          'clients-status ' +
                          (customer.status === 'active' ? 'active' : 'inactive')
                        }
                      >
                        {customer.status}
                      </span>
                    </div>
                    <p className="clients-ref">
                      CRN-
                      {customer.id
                        .replaceAll('-', '')
                        .slice(0, 12)
                        .toUpperCase()}
                    </p>
                    <div className="clients-contact">
                      {customer.phone && (
                        <a href={'tel:' + customer.phone}>
                          <OwnerIcon name="clients" size={14} />
                          {customer.phone}
                        </a>
                      )}
                      {customer.email && (
                        <a href={'mailto:' + customer.email}>
                          <OwnerIcon name="quotations" size={14} />
                          {customer.email}
                        </a>
                      )}
                    </div>
                    <div className="clients-service">
                      {badges.map((badge) => (
                        <span
                          className={'clients-category ' + badge}
                          key={badge}
                        >
                          {badge === 'interior' ? 'Interiors' : 'Construction'}
                        </span>
                      ))}
                      {!badges.length && (
                        <span className="clients-category unclassified">
                          Service not linked
                        </span>
                      )}
                      {possibleDuplicate && (
                        <span className="clients-duplicate">
                          Possible duplicate on this page
                        </span>
                      )}
                    </div>
                    <div className="clients-related">
                      <span>
                        <OwnerIcon name="projects" size={15} />
                        {canProjects
                          ? (relatedProjects.get(customer.id) ?? 0) +
                            ' projects'
                          : 'Projects restricted'}
                      </span>
                      <span>
                        <OwnerIcon name="quotations" size={15} />
                        {canQuotes
                          ? (relatedQuotes.get(customer.id) ?? 0) + ' quotes'
                          : 'Quotes restricted'}
                      </span>
                    </div>
                    <div className="clients-meta">
                      Last recorded activity:{' '}
                      {dateText(
                        activity.get(customer.id) ?? customer.updated_at,
                      )}
                    </div>
                    <div className="clients-card-actions">
                      <Link className="clients-button secondary" href={href}>
                        View profile
                      </Link>
                      {has('quotation.create', 'quotation') &&
                        customer.status === 'active' && (
                          <Link
                            className="clients-button primary"
                            href={
                              '/dashboard/quotations/new?customer=' +
                              customer.id
                            }
                          >
                            New quote
                          </Link>
                        )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="clients-pagination">
            <span>
              Showing {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
              {Math.min(page * PAGE_SIZE, total)} of {total} clients
            </span>
            <div>
              {page > 1 && (
                <Link
                  href={paramsHref({ page: String(page - 1) })}
                  aria-label="Previous page"
                >
                  ← Previous
                </Link>
              )}
              <span>Page {page}</span>
              {page * PAGE_SIZE < total && (
                <Link
                  href={paramsHref({ page: String(page + 1) })}
                  aria-label="Next page"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        </section>
        <p className="clients-footnote">
          Client records are scoped to this company. Matching names alone never
          trigger a merge. Closed–Won lead conversion can link an existing
          client.
        </p>
        {!canBilling && (
          <span className="sr-only">
            Financial information is hidden without billing permission.
          </span>
        )}
      </main>
    </OwnerShell>
  );
}
