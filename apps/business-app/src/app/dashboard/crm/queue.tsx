import Link from 'next/link';
import { crmServices, resultSchema } from './service';
import { pageNumber, type Params } from './lookups';
import { Pagination } from './pagination';
import { MasterForm } from '../commercial/master-form';
import { runCrmCommand } from './actions';
import { OwnerShell, type OwnerNavItem } from '../owner-shell';
import '../owner-dashboard.css';
import './queue.css';
export async function SalesQueue({
  params,
  visits = false,
}: {
  params: Params;
  visits?: boolean;
}) {
  const s = await crmServices('lead.view', true),
    page = pageNumber(params.page),
    path = '/dashboard/crm/' + (visits ? 'site-visits' : 'followups');
  const filter = Object.fromEntries(
    ['queue', 'assigned_to', 'lead_id', 'type']
      .filter((k) => params[k])
      .map((k) => [k, params[k]!]),
  );
  const result = resultSchema.parse(
    await s.crm.search(
      visits ? 'site_visits' : 'lead_followups',
      {
        ...filter,
        status: params.status ?? (visits ? 'scheduled' : 'pending'),
      },
      page,
    ),
  );

  const [organization, user, plans] = await Promise.all([
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.plans().catch(() => null),
  ]);
  if (!organization) throw new Error('Company workspace not available');
  const leadsPath = '/dashboard/crm/leads';
  const nav: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    {
      label: 'CRM',
      href: leadsPath,
      icon: 'leads',
      children: [
        { label: 'All Leads', href: leadsPath },
        { label: 'Follow-ups', href: '/dashboard/crm/followups' },
        { label: 'Site Visits', href: '/dashboard/crm/site-visits' },
        ...(s.allowed('lead.create')
          ? [
              { label: 'Upload Leads', href: leadsPath + '/upload' },
              { label: 'Google Sheets', href: leadsPath + '/google-sheets' },
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
  ];
  const displayName =
    (user.email ?? '')
      .split('@')[0]
      ?.split(/[._-]/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .slice(0, 2)
      .join(' ') || 'Owner';
  const leadIds = [
    ...new Set(
      result.rows
        .map((row) => row.lead_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const leads = leadIds.length
    ? await s.client
        .from('leads')
        .select('id,name,lead_number,phone,phone_normalized')
        .eq('organization_id', s.org)
        .in('id', leadIds)
    : { data: [] };
  const linkedLeads = new Map(
    (leads.data ?? []).map((lead) => [lead.id, lead]),
  );
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
      currentHref={path}
      notificationsEnabled={s.allowed('notification.view')}
    >
      <main id="main-content" className="crm-lead-queue-root">
        <p className="crm-queue-breadcrumb">
          <Link href={leadsPath}>CRM / Leads</Link> <span>›</span>{' '}
          {visits ? 'Site visits' : 'Follow-ups'}
        </p>
        <div className="crm-queue-heading">
          <div>
            <h1>{visits ? 'Site visits' : 'Follow-ups'}</h1>
            <p>
              Everything related to your company&apos;s leads, in one workspace.
            </p>
          </div>
          <Link href={leadsPath} className="crm-queue-back">
            ← All leads
          </Link>
        </div>
        <nav className="crm-queue-tabs" aria-label="Lead work">
          <Link href={leadsPath}>All leads</Link>
          <Link
            aria-current={!visits ? 'page' : undefined}
            href="/dashboard/crm/followups"
          >
            Follow-ups
          </Link>
          <Link
            aria-current={visits ? 'page' : undefined}
            href="/dashboard/crm/site-visits"
          >
            Site visits
          </Link>
        </nav>
        <form className="my-5 flex flex-wrap gap-4">
          <label>
            Queue{' '}
            <select
              name="queue"
              defaultValue={params.queue ?? ''}
              className="rounded border p-2"
            >
              <option value="">All</option>
              {['today', 'overdue', 'upcoming'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Status{' '}
            <select
              name="status"
              defaultValue={params.status ?? (visits ? 'scheduled' : 'pending')}
              className="rounded border p-2"
            >
              {(visits
                ? ['scheduled', 'rescheduled', 'completed', 'cancelled']
                : ['pending', 'completed', 'cancelled']
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {params.lead_id && (
            <input type="hidden" name="lead_id" value={params.lead_id} />
          )}
          <button className="min-h-11 rounded border p-2">Filter queue</button>
        </form>
        <p className="crm-queue-total">
          {result.total} {visits ? 'site visits' : 'follow-ups'} in this view
        </p>
        {!result.rows.length && (
          <p className="crm-queue-empty">
            No records in this queue. Try a different filter.
          </p>
        )}
        <ul>
          {result.rows.map((r) => (
            <li key={String(r.id)} className="my-4 rounded border p-4">
              <div className="crm-queue-lead-line">
                <div>
                  <strong>
                    {linkedLeads.get(String(r.lead_id))?.name || 'Lead'}
                  </strong>
                  <small>
                    {linkedLeads.get(String(r.lead_id))?.lead_number || ''}
                  </small>
                </div>
                <Link href={leadsPath + '/' + String(r.lead_id)}>
                  View lead →
                </Link>
              </div>
              {linkedLeads.get(String(r.lead_id))?.phone && (
                <a
                  className="crm-queue-phone"
                  href={
                    'tel:' +
                    (linkedLeads.get(String(r.lead_id))?.phone_normalized ||
                      linkedLeads.get(String(r.lead_id))?.phone)
                  }
                >
                  Call customer
                </a>
              )}
              <p>
                {new Date(
                  String(visits ? r.scheduled_at : r.due_at),
                ).toLocaleString()}{' '}
                · {String(r.status)}
              </p>
              <p className="whitespace-pre-wrap">
                {String(visits ? r.notes : r.note)}
              </p>
              {!visits &&
                r.status === 'pending' &&
                s.allowed('crm.followup.manage') && (
                  <MasterForm
                    title="Complete follow-up"
                    submitAction={runCrmCommand}
                    initial={{
                      action: 'followup',
                      id: r.id,
                      version: r.version,
                      status: 'completed',
                      outcome: '',
                    }}
                    fields={[{ key: 'outcome', label: 'Outcome' }]}
                  />
                )}
            </li>
          ))}
        </ul>
        <Pagination
          path={path}
          params={params}
          page={page}
          total={result.total}
        />
      </main>
    </OwnerShell>
  );
}
