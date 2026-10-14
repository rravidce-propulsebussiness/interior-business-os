import { canAccess } from '@business-os/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OriginLeads } from '../../commercial/origin-leads';
import { commercialServices } from '../../commercial/service';
import { MasterForm } from '../../commercial/master-form';
import { OwnerIcon, OwnerShell } from '../../owner-shell';
import { projectWorkspaceNavigation } from '../../projects/project-workspace-navigation';
import { CustomerReference } from './reference';
import { leadServiceFromIndustryKey } from '../../crm/leads/lead-service-options';
import '../../owner-dashboard.css';
import './customer-profile.css';
import './client-profile-light.css';

export const dynamic = 'force-dynamic';

const customerFields = [
  { key: 'display_name', label: 'Customer name', required: true },
  { key: 'legal_name', label: 'Legal name' },
  { key: 'phone', label: 'Phone', type: 'tel' as const },
  { key: 'secondary_phone', label: 'Secondary phone', type: 'tel' as const },
  { key: 'email', label: 'Email', type: 'email' as const },
  { key: 'tax_identifier', label: 'Tax identifier' },
  ...['line1', 'line2', 'city', 'region', 'postal_code', 'country_code'].map(
    (key) => ({
      key: 'billing_address.' + key,
      label: 'Billing ' + key.replaceAll('_', ' '),
    }),
  ),
  { key: 'notes', label: 'Internal notes', type: 'textarea' as const },
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
  },
];

const contactFields = [
  { key: 'name', label: 'Contact name', required: true },
  { key: 'role', label: 'Role' },
  { key: 'phone', label: 'Phone', type: 'tel' as const },
  { key: 'email', label: 'Email', type: 'email' as const },
  { key: 'is_primary', label: 'Primary contact', type: 'checkbox' as const },
];

function display(value: string | null | undefined) {
  return value?.trim() || 'Not provided';
}

function Stat({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: string;
  href?: string | undefined;
  icon: 'quotations' | 'projects' | 'expenses';
}) {
  const children = (
    <>
      <span className="cp-stat-icon">
        <OwnerIcon name={icon} size={23} />
      </span>
      <span className="cp-stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </span>
      {href && (
        <span className="cp-stat-arrow" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  return href ? (
    <Link className="cp-stat" href={href}>
      {children}
    </Link>
  ) : (
    <div className="cp-stat">{children}</div>
  );
}

export default async function Customer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await commercialServices('customer.view', 'customers', true);
  const { data: customer, error } = await s.client
    .from('customers')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (error || !customer) notFound();

  const canManage =
    s.allowed('customer.manage', 'quotation') ||
    s.allowed('customer.manage', 'crm');
  const canSeeProjects = s.allowed('project.view', 'projects');
  const canCreateProject = s.allowed('project.create', 'projects');
  const canSeeQuotes = s.allowed('quotation.view', 'quotation');
  const canCreateQuote = s.allowed('quotation.create', 'quotation');
  const canSeeStatement = canAccess(s.context, {
    organizationId: s.org,
    permission: 'financial_report.view',
    moduleKey: 'billing',
  });
  const has = (permission: string, moduleKey?: string) =>
    canAccess(s.context, {
      organizationId: s.org,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });

  const [organization, user, plans, contactResult, projectResult, quoteResult, industries] =
    await Promise.all([
      s.repository.organization(s.org),
      s.authorization.requireAuthenticatedUser(),
      s.repository.plans().catch(() => []),
      s.client
        .from('customer_contacts')
        .select('*')
        .eq('organization_id', s.org)
        .eq('customer_id', id)
        .order('name')
        .limit(100),
      canSeeProjects
        ? s.client
            .from('projects')
            .select('id,name,status,created_at,industry_id', { count: 'exact' })
            .eq('organization_id', s.org)
            .eq('customer_id', id)
            .order('created_at', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [], count: null }),
      canSeeQuotes
        ? s.client
            .from('quotations')
            .select('id,created_at', { count: 'exact' })
            .eq('organization_id', s.org)
            .eq('customer_id', id)
            .order('created_at', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [], count: null }),
      s.repository.industries(),
    ]);
  if (!organization) throw new Error('Company workspace unavailable.');

  const contacts = contactResult.data ?? [];
  const projects = projectResult.data ?? [];
  const quotations = quoteResult.data ?? [];
  const services = [...new Set(
    projects
      .map((project) => {
        const industry = industries.find((item) => item.id === project.industry_id);
        return industry ? leadServiceFromIndustryKey(industry.key) : null;
      })
      .filter((service): service is 'construction' | 'interior' => Boolean(service)),
  )];
  const accountEmail = user.email ?? '';
  const planLabel =
    plans.find((plan) => plan.id === organization.plan_id)?.name ??
    'Business plan';
  const reference =
    'CRN-' + customer.id.replaceAll('-', '').slice(0, 12).toUpperCase();
  const phone = (customer.phone ?? '').replace(/[^+\d]/g, '');
  const whatsappDigits = (customer.phone ?? '').replace(/\D/g, '');
  const whatsapp =
    whatsappDigits.length === 10
      ? '91' + whatsappDigits
      : whatsappDigits.length >= 11 && whatsappDigits.length <= 15
        ? whatsappDigits
        : '';
  const projectHref = '/dashboard/projects?customer=' + encodeURIComponent(id);
  const timelineHref =
    '/dashboard/customers/' + encodeURIComponent(id) + '/activity';
  const statementHref =
    '/dashboard/finance/statements/' + encodeURIComponent(id);
  const recentRecords = [
    ...projects.map((item) => ({
      id: 'project-' + item.id,
      title: item.name,
      kind: 'Project',
      date: item.created_at,
      href: '/dashboard/projects/' + item.id,
    })),
    ...quotations.map((item) => ({
      id: 'quote-' + item.id,
      title: 'Customer quotation',
      kind: 'Quotation',
      date: item.created_at,
      href: '/dashboard/quotations',
    })),
  ]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 4);

  return (
    <div className="customer-profile-theme client-profile-light">
      <OwnerShell
        companyName={organization.name}
        accountLabel={accountEmail.split('@')[0] || 'Team member'}
        accountEmail={accountEmail}
        planLabel={planLabel}
        navigation={projectWorkspaceNavigation(has)}
        search=""
        notificationsEnabled={has('notification.view')}
        currentHref="/dashboard/customers"
      >
        <main id="main-content" tabIndex={-1} className="cp-page">
          <nav className="cp-breadcrumb" aria-label="Breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <span aria-hidden="true">/</span>
            <Link href="/dashboard/customers">Customers</Link>
            <span aria-hidden="true">/</span>
            <span>Customer account</span>
          </nav>

          <header className="cp-hero">
            <span className="cp-avatar" aria-hidden="true">
              {customer.display_name?.trim().charAt(0).toUpperCase() || 'C'}
            </span>
            <div className="cp-hero-content">
              <p className="cp-account-eyebrow">Customer account</p>
              <h1>{customer.display_name}</h1>
              <span
                className={
                  'cp-status ' +
                  (customer.status === 'active'
                    ? 'cp-status-active'
                    : 'cp-status-inactive')
                }
              >
                <span aria-hidden="true">●</span>
                {customer.status === 'active'
                  ? 'Active customer'
                  : 'Inactive customer'}
              </span>
              <CustomerReference value={reference} />
              {services.length > 0 && (
                <div className="cp-service-tags" aria-label="Linked project services">
                  {services.map((service) => (
                    <span key={service} className={'cp-service-tag ' + service}>
                      {service === 'interior' ? 'Interiors' : 'Construction'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </header>
          <div className="cp-origin-leads cp-origin-near-header">
            <OriginLeads customerId={id} />
          </div>

          <div className="cp-stats" aria-label="Customer summary">
            <Stat
              icon="quotations"
              label="Quotations"
              value={canSeeQuotes ? String(quoteResult.count ?? 0) : '—'}
              href={canSeeQuotes ? '#quotes' : undefined}
            />
            <Stat
              icon="projects"
              label="Projects"
              value={canSeeProjects ? String(projectResult.count ?? 0) : '—'}
              href={canSeeProjects ? '#projects' : undefined}
            />
            <Stat
              icon="expenses"
              label="Account statement"
              value={canSeeStatement ? 'View' : '—'}
              href={canSeeStatement ? statementHref : undefined}
            />
          </div>

          <div className="cp-actions" aria-label="Customer actions">
            {phone && (
              <a href={'tel:' + phone} className="cp-action">
                <span aria-hidden="true">☎</span> Call
              </a>
            )}
            {whatsapp && (
              <a
                href={'https://wa.me/' + whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="cp-action cp-whatsapp"
              >
                <span aria-hidden="true">◉</span> WhatsApp
              </a>
            )}
            {canCreateQuote && customer.status === 'active' && (
              <Link
                className="cp-action"
                href={
                  '/dashboard/quotations/new?customer=' + encodeURIComponent(id)
                }
              >
                <OwnerIcon name="quotations" size={18} /> New quote
              </Link>
            )}
            {canCreateProject && (
              <Link className="cp-action" href={projectHref + '&new=1'}>
                <OwnerIcon name="projects" size={18} /> New project
              </Link>
            )}
          </div>

          <nav className="cp-tabs" aria-label="Customer record sections">
            <a href="#overview" className="cp-tab-current">
              Overview
            </a>
            {canSeeProjects && <a href="#projects">Projects</a>}
            {canSeeQuotes && <a href="#quotes">Quotes</a>}
            <a href="#activity">Activity</a>
          </nav>

          <div className="cp-section-grid" id="overview">
            <section className="cp-panel">
              <div className="cp-section-heading">
                <h2>
                  <span aria-hidden="true">♟</span> Contact information
                </h2>
                {canManage && (
                  <a className="cp-small-action" href="#edit-customer">
                    ✎ Edit
                  </a>
                )}
              </div>
              <dl className="cp-info">
                <div>
                  <dt>☎ Phone</dt>
                  <dd>
                    {phone ? (
                      <a href={'tel:' + phone}>{customer.phone}</a>
                    ) : (
                      'Not provided'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>✉ Email</dt>
                  <dd>
                    {customer.email ? (
                      <a href={'mailto:' + customer.email}>{customer.email}</a>
                    ) : (
                      'Not provided'
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="cp-panel">
              <div className="cp-section-heading">
                <h2>
                  <OwnerIcon name="clients" size={20} /> Customer details
                </h2>
                {canManage && (
                  <a className="cp-small-action" href="#edit-customer">
                    ✎ Edit details
                  </a>
                )}
              </div>
              <dl className="cp-info">
                <div>
                  <dt>Legal name</dt>
                  <dd>{display(customer.legal_name)}</dd>
                </div>
                <div>
                  <dt>Secondary phone</dt>
                  <dd>{display(customer.secondary_phone)}</dd>
                </div>
                <div>
                  <dt>Customer type</dt>
                  <dd>{display(customer.customer_type)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="cp-record-grid">
            {canSeeProjects && (
              <section className="cp-panel" id="projects">
                <div className="cp-section-heading">
                  <h2>
                    <OwnerIcon name="projects" size={20} /> Projects
                  </h2>
                  <Link className="cp-small-action" href={projectHref}>
                    View all →
                  </Link>
                </div>
                {projects.length ? (
                  <div className="cp-record-list">
                    {projects.map((project) => (
                      <Link
                        href={'/dashboard/projects/' + project.id}
                        key={project.id}
                      >
                        <span>
                          <strong>{project.name}</strong>
                          <small>{project.status}</small>
                        </span>
                        <span aria-hidden="true">›</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="cp-muted">
                    No projects linked to this customer yet.
                  </p>
                )}
              </section>
            )}

            {canSeeQuotes && (
              <section className="cp-panel" id="quotes">
                <div className="cp-section-heading">
                  <h2>
                    <OwnerIcon name="quotations" size={20} /> Quotations
                  </h2>
                  <Link
                    className="cp-small-action"
                    href="/dashboard/quotations"
                  >
                    Quotation studio →
                  </Link>
                </div>
                <p className="cp-muted">
                  {quoteResult.count
                    ? String(quoteResult.count) +
                      ' quotation record(s) linked to ' +
                      reference +
                      '. All revisions are kept together.'
                    : 'No quotations linked to this customer yet.'}
                </p>
                {canCreateQuote && customer.status === 'active' && (
                  <Link
                    className="cp-inline-link"
                    href={
                      '/dashboard/quotations/new?customer=' +
                      encodeURIComponent(id)
                    }
                  >
                    + Create customer quotation
                  </Link>
                )}
              </section>
            )}
          </div>

          <section className="cp-panel cp-wide-panel" id="activity">
            <div className="cp-section-heading">
              <h2>
                <OwnerIcon name="calendar" size={20} /> Recent activity
              </h2>
              <Link className="cp-small-action" href={timelineHref}>
                View full timeline →
              </Link>
            </div>
            {recentRecords.length ? (
              <div className="cp-activity-list">
                {recentRecords.map((record) => (
                  <Link key={record.id} href={record.href}>
                    <span className="cp-activity-mark" aria-hidden="true">
                      ●
                    </span>
                    <span>
                      <strong>{record.title}</strong>
                      <small>
                        {record.kind} ·{' '}
                        {record.date
                          ? new Date(record.date).toLocaleDateString('en-IN')
                          : 'Date unavailable'}
                      </small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="cp-empty-state">
                <OwnerIcon name="calendar" size={28} />
                <strong>No project or quotation records yet</strong>
                <p>
                  Customer interactions and other records can be viewed in the
                  full activity timeline.
                </p>
              </div>
            )}
          </section>

          {canManage && (
            <details id="edit-customer" className="cp-edit-panel cp-panel">
              <summary>
                ✎ Edit customer information <span aria-hidden="true">⌄</span>
              </summary>
              <p className="cp-muted">
                Changes are saved to this customer record under the same CRN.
              </p>
              <MasterForm
                entity="customers"
                title="Save customer"
                initial={customer}
                fields={customerFields}
              />
            </details>
          )}

          <section className="cp-panel cp-wide-panel" id="contacts">
            <div className="cp-section-heading">
              <h2>
                <OwnerIcon name="clients" size={20} /> Additional contacts
              </h2>
              <span className="cp-muted">{contacts.length} contact(s)</span>
            </div>
            {contacts.length === 0 && (
              <p className="cp-muted">No additional contacts added.</p>
            )}
            {contacts.map((contact) => (
              <details key={contact.id} className="cp-contact-row">
                <summary>
                  <span>
                    <strong>{contact.name}</strong>
                    <small>
                      {contact.is_primary
                        ? 'Primary contact'
                        : display(contact.role)}
                    </small>
                  </span>
                  <span aria-hidden="true">⌄</span>
                </summary>
                <p>
                  {display(contact.phone)} · {display(contact.email)}
                </p>
                {canManage && (
                  <MasterForm
                    entity="customer_contacts"
                    initial={contact}
                    title="Save contact"
                    fields={contactFields}
                  />
                )}
              </details>
            ))}
            {canManage && (
              <details className="cp-contact-row cp-add-contact">
                <summary>
                  + Add contact <span aria-hidden="true">⌄</span>
                </summary>
                <MasterForm
                  entity="customer_contacts"
                  initial={{
                    organization_id: s.org,
                    version: 1,
                    customer_id: id,
                    name: '',
                    role: '',
                    phone: '',
                    email: '',
                    is_primary: false,
                  }}
                  title="Create contact"
                  fields={contactFields}
                />
              </details>
            )}
          </section>
        </main>
      </OwnerShell>
    </div>
  );
}
