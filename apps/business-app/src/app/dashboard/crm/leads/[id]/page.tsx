import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idSchema } from '@business-os/shared';
import { crmSchemas } from '@business-os/core/crm';
import { MasterForm, type Field } from '../../../commercial/master-form';
import { crmServices, resultSchema, optionRows } from '../../service';
import {
  lookups,
  LookupSearch,
  leadFields,
  pageNumber,
  type Params,
} from '../../lookups';
import { runCrmCommand, saveCrm } from '../../actions';
import { Pagination } from '../../pagination';
import { OwnerShell, type OwnerNavItem } from '../../../owner-shell';
import { LeadMeetActions } from './lead-meet-actions';
import { LeadCategoryEditor } from './lead-category-editor';
import {
  leadCategoryLabel,
  leadRequirementLabel,
  resolveLeadCategory,
} from '../lead-category';
import { leadServiceFromIndustryKey } from '../lead-service-options';
import '../../../owner-dashboard.css';
import './lead-detail.css';
import '../lead-category.css';

export default async function LeadDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  idSchema.parse(id);
  const p = await searchParams,
    s = await crmServices('lead.view', true);
  const { data: l, error } = await s.client
    .from('leads')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .maybeSingle();
  if (error || !l) notFound();
  const [choices, activity, followups, visits] = await Promise.all([
    lookups(s, p),
    s.crm.search('lead_activities', { lead_id: id }, pageNumber(p.page)),
    s.crm.search(
      'lead_followups',
      { lead_id: id, status: 'pending' },
      pageNumber(p.followup_page),
    ),
    s.crm.search('site_visits', { lead_id: id }, pageNumber(p.visit_page)),
  ]);
  const timeline = resultSchema.parse(activity),
    tasks = resultSchema.parse(followups),
    siteVisits = resultSchema.parse(visits);
  const initial: Record<string, unknown> = Object.fromEntries(
    Object.keys(crmSchemas.leads.shape)
      .filter((k) => k in l && !['assigned_to', 'stage_id'].includes(k))
      .map((k) => [k, l[k as keyof typeof l]]),
  );
  initial.budget_min = l.budget_min === null ? null : String(l.budget_min);
  initial.budget_max = l.budget_max === null ? null : String(l.budget_max);
  const staff = [
    { value: '', label: 'Choose assignee' },
    ...optionRows(choices.team),
  ];
  const requirementFields: Field[] = choices.requirements.rows
    .filter((r) => !r.industry_id || r.industry_id === l.industry_id)
    .map((r) => ({
      key: 'requirements.' + String(r.key),
      label: String(r.name),
      required: Boolean(r.required),
      type:
        r.field_type === 'boolean'
          ? 'checkbox'
          : r.field_type === 'number'
            ? 'number'
            : 'text',
      ...(r.field_type === 'select'
        ? {
            options: [
              { value: '', label: 'Not specified' },
              ...(Array.isArray(r.options) ? r.options : []).map((v) => ({
                value: String(v),
                label: String(v),
              })),
            ],
          }
        : {}),
    }));

  const [organization, user, plans, memberships, industries] =
    await Promise.all([
      s.repository.organization(s.org),
      s.authorization.requireAuthenticatedUser(),
      s.repository.plans().catch(() => null),
      s.client
        .from('organization_industries')
        .select('industry_id')
        .eq('organization_id', s.org),
      s.repository.industries(),
    ]);
  if (!organization) throw new Error('Company workspace not available');
  const enabledIds = new Set(
    memberships.error ? [] : (memberships.data ?? []).map((item) => item.industry_id),
  );
  const enabledIndustries = industries.filter(
    (industry) => enabledIds.has(industry.id) && industry.status === 'active',
  );
  const category = resolveLeadCategory(l, enabledIndustries);
  const categoryLabel = leadCategoryLabel(category);
  const categoryOptions = enabledIndustries
    .map((industry) => leadServiceFromIndustryKey(industry.key))
    .filter((value): value is 'construction' | 'interior' => value !== null);
  const serviceOptions = [...new Set(categoryOptions)];
  const requirementLabel = leadRequirementLabel(l);
  const leadPath = '/dashboard/crm/leads';
  const nav: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    {
      label: 'CRM',
      href: leadPath,
      icon: 'leads',
      children: [
        { label: 'All Leads', href: leadPath },
        { label: 'Follow-ups', href: '/dashboard/crm/followups' },
        { label: 'Site Visits', href: '/dashboard/crm/site-visits' },
        ...(s.allowed('lead.create')
          ? [
              { label: 'Upload Leads', href: leadPath + '/upload' },
              { label: 'Google Sheets', href: leadPath + '/google-sheets' },
            ]
          : []),
        ...(s.allowed('crm.pipeline.manage')
          ? [{ label: 'CRM Settings', href: '/dashboard/crm/settings' }]
          : []),
      ],
    },
    ...(s.allowed('quotation.view', 'quotation')
      ? [
          {
            label: 'Quotations',
            href: '/dashboard/quotations',
            icon: 'quotations' as const,
          },
        ]
      : []),
    ...(s.allowed('project.view', 'projects')
      ? [
          {
            label: 'Projects',
            href: '/dashboard/projects',
            icon: 'projects' as const,
          },
        ]
      : []),
    ...(s.allowed('customer.view', 'crm') ||
    s.allowed('customer.view', 'quotation')
      ? [
          {
            label: 'Clients',
            href: '/dashboard/customers',
            icon: 'clients' as const,
          },
        ]
      : []),
    ...(s.allowed('organization.view')
      ? [
          {
            label: 'Company Settings',
            href: '/dashboard/company/settings',
            icon: 'settings' as const,
          },
        ]
      : []),
  ];
  const displayName =
    (user.email ?? '')
      .split('@')[0]
      ?.split(/[._-]/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .slice(0, 2)
      .join(' ') || 'Owner';
  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={displayName}
      accountEmail={user.email ?? ''}
      planLabel={
        plans?.find((plan) => plan.id === organization.plan_id)?.name ??
        'Business plan'
      }
      navigation={nav}
      search=""
      currentHref={leadPath}
      notificationsEnabled={s.allowed('notification.view')}
    >
      <main id="main-content" className="crm-lead-detail-root">
        <nav className="crm-lead-detail-breadcrumb" aria-label="Breadcrumb">
          <Link href={leadPath}>CRM / Leads</Link>
          <span aria-hidden="true">›</span>
          <strong>{l.lead_number || 'Lead details'}</strong>
        </nav>
        <div className="crm-lead-detail-page-heading">
          <div>
            <h1>Lead details</h1>
            <p>
              Customer information, discussions, visits and next actions in one
              place.
            </p>
          </div>
          <Link className="crm-lead-detail-back" href={leadPath}>
            ← All leads
          </Link>
        </div>
        <section className="crm-lead-detail-hero" aria-label="Customer lead">
          <div className="crm-lead-detail-identity">
            <span className="crm-lead-detail-avatar" aria-hidden="true">
              {l.name?.trim().charAt(0).toUpperCase() || 'L'}
            </span>
            <div>
              <div className="crm-lead-detail-name-line">
                <h2>{l.name}</h2>
                <span className="crm-lead-detail-badge">{l.lifecycle}</span>
                <span
                  className={
                    'crm-lead-service-badge crm-lead-service-' +
                    (category ?? 'unclassified')
                  }
                >
                  {categoryLabel}
                </span>
                <span className="crm-lead-detail-priority">
                  {l.priority} priority
                </span>
              </div>
              <p>
                {l.lead_number} {l.location ? ' · ' + l.location : ''}
              </p>
            </div>
          </div>
          <div className="crm-lead-detail-contact">
            <div>
              <span>Phone</span>
              <strong>{l.phone || 'Not specified'}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{l.email || 'Not specified'}</strong>
            </div>
            <div>
              <span>Service category</span>
              <strong>{categoryLabel}</strong>
            </div>
            <div>
              <span>Project requirement</span>
              <strong>{requirementLabel || 'Not specified'}</strong>
            </div>
            <div>
              <span>Budget</span>
              <strong>
                {l.budget_min ?? 'Not specified'} –{' '}
                {l.budget_max ?? 'Not specified'}
              </strong>
            </div>
            <div>
              <span>Next follow-up</span>
              <strong>
                {l.next_follow_up_at
                  ? new Date(l.next_follow_up_at).toLocaleString('en-IN')
                  : 'Not scheduled'}
              </strong>
            </div>
          </div>
          <div className="crm-lead-detail-primary-actions">
            <a
              className="crm-lead-button-blue"
              href={'tel:' + (l.phone_normalized || l.phone)}
            >
              Call customer
            </a>
            {l.email && (
              <a className="crm-lead-button-light" href={'mailto:' + l.email}>
                Email
              </a>
            )}
            <a className="crm-lead-button-light" href="#lead-followups">
              Follow-up
            </a>
            <a className="crm-lead-button-light" href="#lead-site-visits">
              Site visit
            </a>
          </div>
        </section>
        {s.allowed('lead.manage') && l.lifecycle !== 'archived' && (
          <LeadCategoryEditor
            leadId={id}
            version={l.version}
            currentCategory={category}
            categories={serviceOptions}
          />
        )}
        <nav className="crm-lead-detail-tabs" aria-label="Lead sections">
          <a href="#lead-daily-actions">Actions</a>
          <a href="#lead-followups">Follow-ups</a>
          <a href="#lead-site-visits">Site visits</a>
          <a href="#lead-meeting">Google Meet</a>
          <a href="#lead-activity">Activity</a>
          <a href="#lead-details">Edit details</a>
        </nav>
        <section className="crm-lead-detail-summary" aria-label="Lead notes">
          <strong>Customer notes</strong>
          <p className="whitespace-pre-wrap">
            {l.notes || 'No customer notes yet.'}
          </p>
        </section>
        <div id="lead-meeting">
          <LeadMeetActions
            leadId={id}
            leadName={l.name}
            email={l.email}
            canRecord={s.allowed('crm.activity.create')}
          />
        </div>

        {l.converted_project_id ? (
          <section className="my-6 rounded border p-4">
            <h2 className="text-xl font-semibold">Converted</h2>
            <div className="flex flex-wrap gap-5">
              <Link
                className="underline"
                href={'/dashboard/customers/' + l.converted_customer_id}
              >
                Customer
              </Link>
              <Link
                className="underline"
                href={'/dashboard/projects/' + l.converted_project_id}
              >
                Project and related quotations
              </Link>
              {s.allowed('quotation.create', 'quotation') && (
                <Link
                  className="underline"
                  href={
                    '/dashboard/quotations?project=' + l.converted_project_id
                  }
                >
                  Create quotation
                </Link>
              )}
            </div>
          </section>
        ) : (
          s.allowed('lead.convert') &&
          l.lifecycle === 'open' && (
            <Link
              className="my-4 inline-block rounded border p-3"
              href={'/dashboard/crm/leads/' + id + '/convert'}
            >
              Convert lead
            </Link>
          )
        )}
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 id="lead-daily-actions" className="text-2xl font-semibold">
              Daily actions
            </h2>
            {s.allowed('crm.activity.create') && (
              <details>
                <summary>Add note or communication record</summary>
                <MasterForm
                  title="Add activity"
                  submitAction={saveCrm.bind(null, 'lead_activities')}
                  initial={{
                    lead_id: id,
                    activity_type: 'note',
                    subject: '',
                    body: '',
                  }}
                  fields={[
                    {
                      key: 'activity_type',
                      label: 'Activity type',
                      options: [
                        'note',
                        'phone_call',
                        'meeting',
                        'email_note',
                        'whatsapp_note',
                      ].map((value) => ({
                        value,
                        label: value.replaceAll('_', ' '),
                      })),
                    },
                    { key: 'subject', label: 'Subject' },
                    {
                      key: 'body',
                      label: 'Activity note',
                      type: 'textarea',
                      required: true,
                    },
                  ]}
                />
              </details>
            )}
            {s.allowed('lead.assign') && (
              <details>
                <summary>Assign salesperson</summary>
                <MasterForm
                  title="Assign lead"
                  submitAction={runCrmCommand}
                  initial={{
                    action: 'assign',
                    id,
                    version: l.version,
                    assigned_to: l.assigned_to,
                  }}
                  fields={[
                    {
                      key: 'assigned_to',
                      label: 'Assignee',
                      nullable: true,
                      options: [
                        { value: '', label: 'Unassigned' },
                        ...optionRows(choices.team),
                      ],
                    },
                  ]}
                />
              </details>
            )}
            {s.allowed('lead.manage') && (
              <details>
                <summary>Change stage</summary>
                <MasterForm
                  title="Change stage"
                  submitAction={runCrmCommand}
                  initial={{
                    action: 'stage',
                    id,
                    version: l.version,
                    stage_id: l.stage_id,
                    lost_reason_id: null,
                    note: '',
                  }}
                  fields={[
                    {
                      key: 'stage_id',
                      label: 'Stage',
                      options: optionRows(
                        choices.stages.rows.filter(
                          (r) => r.outcome !== 'won' || s.allowed('lead.win'),
                        ),
                      ),
                    },
                    {
                      key: 'lost_reason_id',
                      label: 'Lost reason (required for Lost)',
                      nullable: true,
                      options: [
                        { value: '', label: 'Not applicable' },
                        ...optionRows(choices.reasons.rows),
                      ],
                    },
                    {
                      key: 'note',
                      label: 'Outcome note (required for Won)',
                      type: 'textarea',
                    },
                  ]}
                />
              </details>
            )}
            {s.allowed('crm.followup.manage') && (
              <details>
                <summary>Schedule follow-up</summary>
                <MasterForm
                  title="Schedule follow-up"
                  submitAction={saveCrm.bind(null, 'lead_followups')}
                  initial={{
                    lead_id: id,
                    assigned_to: l.assigned_to ?? '',
                    due_at: '',
                    followup_type: 'call',
                    note: '',
                  }}
                  fields={[
                    {
                      key: 'assigned_to',
                      label: 'Follow-up assignee',
                      required: true,
                      options: staff,
                    },
                    {
                      key: 'due_at',
                      label: 'Due at (your local time)',
                      type: 'datetime-local',
                      required: true,
                    },
                    {
                      key: 'followup_type',
                      label: 'Type',
                      options: ['call', 'meeting', 'quotation', 'other'].map(
                        (value) => ({ value, label: value }),
                      ),
                    },
                    { key: 'note', label: 'Follow-up note', type: 'textarea' },
                  ]}
                />
              </details>
            )}
            {s.allowed('crm.site_visit.manage') && (
              <details>
                <summary>Schedule site visit</summary>
                <MasterForm
                  title="Schedule site visit"
                  submitAction={saveCrm.bind(null, 'site_visits')}
                  initial={{
                    lead_id: id,
                    assigned_to: l.assigned_to ?? '',
                    scheduled_at: '',
                    site_address: l.site_address,
                    contact_person: l.name,
                    notes: '',
                  }}
                  fields={[
                    {
                      key: 'assigned_to',
                      label: 'Visit assignee',
                      required: true,
                      options: staff,
                    },
                    {
                      key: 'scheduled_at',
                      label: 'Scheduled at (your local time)',
                      type: 'datetime-local',
                      required: true,
                    },
                    { key: 'contact_person', label: 'Contact person' },
                    ...[
                      'line1',
                      'line2',
                      'city',
                      'region',
                      'postal_code',
                      'country_code',
                    ].map((k) => ({
                      key: 'site_address.' + k,
                      label: 'Site ' + k.replaceAll('_', ' '),
                    })),
                    { key: 'notes', label: 'Visit notes', type: 'textarea' },
                  ]}
                />
              </details>
            )}
            <h2 id="lead-followups" className="mt-6 text-xl font-semibold">
              Pending follow-ups
            </h2>
            {!tasks.rows.length && <p>No pending follow-ups.</p>}
            {tasks.rows.map((f) => (
              <article key={String(f.id)} className="my-3 rounded border p-4">
                <p>
                  {String(f.followup_type)} ·{' '}
                  {new Date(String(f.due_at)).toLocaleString()}
                </p>
                <p>{String(f.note)}</p>
                {s.allowed('crm.followup.manage') && (
                  <MasterForm
                    title="Update follow-up"
                    submitAction={runCrmCommand}
                    initial={{
                      action: 'followup',
                      id: f.id,
                      version: f.version,
                      status: 'completed',
                      outcome: '',
                    }}
                    fields={[
                      {
                        key: 'status',
                        label: 'Follow-up action',
                        options: [
                          { value: 'completed', label: 'Complete' },
                          { value: 'cancelled', label: 'Cancel' },
                        ],
                      },
                      { key: 'outcome', label: 'Outcome' },
                    ]}
                  />
                )}
              </article>
            ))}
            {tasks.total > 25 && (
              <Link href={'/dashboard/crm/followups?lead_id=' + id}>
                View all follow-ups
              </Link>
            )}
            <h2 id="lead-site-visits" className="mt-6 text-xl font-semibold">
              Site visits
            </h2>
            {!siteVisits.rows.length && <p>No site visits.</p>}
            {siteVisits.rows.map((v) => (
              <article key={String(v.id)} className="my-3 rounded border p-4">
                <p>
                  {new Date(String(v.scheduled_at)).toLocaleString()} ·{' '}
                  {String(v.status)}
                </p>
                <p className="whitespace-pre-wrap">
                  {String(v.notes)} {String(v.outcome)}
                </p>
                {s.allowed('crm.site_visit.manage') &&
                  !['completed', 'cancelled'].includes(String(v.status)) && (
                    <MasterForm
                      title="Record visit"
                      submitAction={runCrmCommand}
                      initial={{
                        action: 'visit',
                        id: v.id,
                        version: v.version,
                        status: 'completed',
                        scheduled_at: null,
                        notes: v.notes,
                        outcome: '',
                      }}
                      fields={[
                        {
                          key: 'status',
                          label: 'Visit action',
                          options: [
                            'completed',
                            'cancelled',
                            'rescheduled',
                          ].map((value) => ({ value, label: value })),
                        },
                        {
                          key: 'scheduled_at',
                          label: 'New date for reschedule',
                          type: 'datetime-local',
                          nullable: true,
                        },
                        {
                          key: 'notes',
                          label:
                            'Observations, approximate dimensions, access and preferences',
                          type: 'textarea',
                        },
                        {
                          key: 'outcome',
                          label: 'Visit outcome',
                          type: 'textarea',
                        },
                      ]}
                    />
                  )}
              </article>
            ))}
            {siteVisits.total > 25 && (
              <Link href={'/dashboard/crm/site-visits?lead_id=' + id}>
                View all visits
              </Link>
            )}
          </section>
          <section>
            <h2 id="lead-activity" className="text-2xl font-semibold">
              Activity timeline
            </h2>
            {!timeline.rows.length && <p>No activity yet.</p>}
            <ol className="my-4 grid gap-4">
              {timeline.rows.map((a) => (
                <li key={String(a.id)} className="border-l-2 pl-4">
                  <p className="font-medium">
                    {String(a.subject || a.activity_type).replaceAll('_', ' ')}{' '}
                    {a.system_generated ? '(system)' : ''}
                  </p>
                  <time>
                    {new Date(String(a.occurred_at)).toLocaleString()}
                  </time>
                  <p className="whitespace-pre-wrap">{String(a.body)}</p>
                </li>
              ))}
            </ol>
            <Pagination
              path={'/dashboard/crm/leads/' + id}
              params={p}
              page={pageNumber(p.page)}
              total={timeline.total}
            />
          </section>
        </div>
        <div id="lead-details">
          <LookupSearch />
        </div>
        {s.allowed('lead.manage') && l.lifecycle !== 'archived' && (
          <>
            <details className="my-6">
              <summary>Edit lead details and requirements</summary>
              <MasterForm
                title="Save lead details"
                submitAction={saveCrm.bind(null, 'leads')}
                initial={initial}
                fields={[
                    ...leadFields(choices, true).filter(
                      (field) =>
                        field.key !== 'industry_id' &&
                        field.key !== 'service_type',
                    ),
                    ...requirementFields,
                  ]}
              />
            </details>
            <details>
              <summary>Archive lead</summary>
              <p>
                Keep its conversion and activity history. Archived leads cannot
                be edited.
              </p>
              <MasterForm
                title="Archive lead"
                submitAction={runCrmCommand}
                initial={{ action: 'archive', id, version: l.version }}
                fields={[]}
              />
            </details>
          </>
        )}
      </main>
    </OwnerShell>
  );
}
