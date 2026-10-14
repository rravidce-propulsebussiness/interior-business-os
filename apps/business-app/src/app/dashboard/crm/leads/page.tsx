import { canAccess } from '@business-os/auth';
import { redirect } from 'next/navigation';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import type { ProPulseConnectionView } from './propulse-connect-panel';
import { crmServices, resultSchema } from '../service';
import { lookups, pageNumber, type Params } from '../lookups';
import { OwnerShell, type OwnerNavItem } from '../../owner-shell';
import {
  LeadsWorkspace,
  type LeadView,
  type LeadOption,
  type LeadStage,
  type LeadTab,
} from './workspace';
import {
  leadServiceFromIndustryKey,
  type LeadServiceOption,
} from './lead-service-options';
import {
  leadRequirementLabel,
  resolveLeadCategory,
} from './lead-category';
import '../../owner-dashboard.css';
import './leads.css';
import './lead-category.css';

export const dynamic = 'force-dynamic';

const base = '/dashboard/crm/leads';
const number = new Intl.NumberFormat('en-IN');
const allowedFilters = [
  'q',
  'stage_id',
  'assigned_to',
  'source_id',
  'branch_id',
  'priority',
  'due',
  'from',
  'until',
  'converted',
  'lifecycle',
  'sort',
  'unassigned',
  'view',
] as const;

function label(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!String(value).trim() || !Number.isFinite(Number(value))) return null;
  return String(value);
}

function searchLink(
  params: Params,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const key of allowedFilters) {
    if (params[key]) next.set(key, params[key]!);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? base + '?' + query : base;
}

async function metric(run: Promise<unknown>): Promise<number | null> {
  try {
    const parsed = resultSchema.parse(await run);
    return parsed.total;
  } catch {
    return null;
  }
}

export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams;
  if (p.panel === 'sheet') redirect('/dashboard/crm/leads/upload');
  const s = await crmServices('lead.view', true);
  const page = pageNumber(p.page);
  const choices = await lookups(s, p);
  const filter = Object.fromEntries(
    allowedFilters
      .filter((key) => key !== 'view' && p[key])
      .map((key) => [key, p[key]!]),
  );
  const [result, organization, user, plans, companyIndustries, industries] =
    await Promise.all([
      s.crm
        .search('leads', filter, page)
        .then((value) => resultSchema.parse(value)),
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
  // Only active industries explicitly assigned to the current tenant may be
  // offered. If membership lookup fails, fail closed instead of offering all.
  const assignedIndustries = new Set(
    companyIndustries.error
      ? []
      : (companyIndustries.data ?? []).map((entry) => entry.industry_id),
  );
  const services: LeadServiceOption[] = [];
  for (const industry of industries) {
    if (!assignedIndustries.has(industry.id)) continue;
    const value = leadServiceFromIndustryKey(industry.key);
    if (value && !services.some((entry) => entry.value === value))
      services.push({
        value,
        label: value === 'construction' ? 'Construction' : 'Interiors',
      });
  }

  // Secondary cards are optional. A failed analytics query must not make
  // the company's lead list or existing navigation unusable.
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: organization.default_timezone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const [total, newToday, dueToday, overdue, converted, lost] =
    await Promise.all([
      metric(s.crm.search('leads', {})),
      metric(s.crm.search('leads', { from: today, until: today })),
      metric(
        s.crm.search('lead_followups', { queue: 'today', status: 'pending' }),
      ),
      metric(
        s.crm.search('lead_followups', { queue: 'overdue', status: 'pending' }),
      ),
      metric(s.crm.search('leads', { converted: true })),
      metric(s.crm.search('leads', { lifecycle: 'lost' })),
    ]);

  const stages: LeadStage[] = choices.stages.rows
    .filter((r) => typeof r.id === 'string' && typeof r.name === 'string')
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      outcome: r.outcome === 'won' || r.outcome === 'lost' ? r.outcome : 'open',
    }));
  const assignees: LeadOption[] = choices.team.map((member) => ({
    value: member.user_id,
    label: member.full_name,
  }));
  const sources: LeadOption[] = choices.sources.rows.map((source) => ({
    value: String(source.id),
    label: String(source.name),
  }));
  const branches: LeadOption[] = choices.branches.map((branch) => ({
    value: branch.id,
    label: branch.name,
  }));
  const reasons: LeadOption[] = choices.reasons.rows.map((reason) => ({
    value: String(reason.id),
    label: String(reason.name),
  }));
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const enabledIndustryEntries = industries.filter(
    (entry) => assignedIndustries.has(entry.id) && entry.status === 'active',
  );
  const sourcesById = new Map(
    sources.map((source) => [source.value, source.label]),
  );
  const teamById = new Map(
    assignees.map((member) => [member.value, member.label]),
  );
  const rows: LeadView[] = result.rows.map((r) => {
    const stageId = label(r.stage_id);
    const assigneeId = label(r.assigned_to);
    return {
      id: label(r.id),
      version: typeof r.version === 'number' ? r.version : 1,
      name: label(r.name) || 'Unnamed lead',
      companyName: label(r.company_name),
      number: label(r.lead_number),
      phone: label(r.phone),
      phoneNormalized: label(r.phone_normalized),
      email: label(r.email),
      source:
        sourcesById.get(label(r.source_id)) ?? label(r.source_detail) ?? '',
      priority: label(r.priority) || 'normal',
      lifecycle: label(r.lifecycle) || 'open',
      stageId,
      stageName:
        stagesById.get(stageId)?.name ?? (label(r.lifecycle) || 'Open'),
      assignedTo: assigneeId,
      assignedName: teamById.get(assigneeId) ?? '',
      location: label(r.location),
      category: resolveLeadCategory(r, enabledIndustryEntries),
      requirement: leadRequirementLabel(r),
      requirements:
        r.requirements &&
        typeof r.requirements === 'object' &&
        !Array.isArray(r.requirements)
          ? Object.fromEntries(
              Object.entries(r.requirements).filter(
                (item): item is [string, string] =>
                  typeof item[1] === 'string' && Boolean(item[1].trim()),
              ),
            )
          : {},
      projectSize: label(r.project_size),
      budgetMin: finiteNumber(r.budget_min),
      budgetMax: finiteNumber(r.budget_max),
      notes: label(r.notes),
      nextFollowUpAt: optionalText(r.next_follow_up_at),
      createdAt: optionalText(r.created_at),
      updatedAt: optionalText(r.updated_at),
      expectedStartDate: optionalText(r.expected_start_date),
      convertedProjectId: optionalText(r.converted_project_id),
      convertedCustomerId: optionalText(r.converted_customer_id),
    };
  });

  const tabs: LeadTab[] = [
    {
      label: 'All Leads',
      href: searchLink(p, {
        lifecycle: null,
        stage_id: null,
        converted: null,
        due: null,
      }),
      count: total,
      active: !p.lifecycle && !p.stage_id && !p.converted && !p.due,
    },
    ...stages
      .filter((stage) => stage.outcome === 'open')
      .slice(0, 4)
      .map((stage) => ({
        label: stage.name,
        href: searchLink(p, {
          stage_id: stage.id,
          lifecycle: null,
          converted: null,
          due: null,
        }),
        count: p.stage_id === stage.id ? result.total : null,
        active: p.stage_id === stage.id,
      })),
    {
      label: 'Converted',
      href: searchLink(p, {
        converted: 'true',
        lifecycle: null,
        stage_id: null,
        due: null,
      }),
      count: converted,
      active: p.converted === 'true',
    },
    {
      label: 'Lost',
      href: searchLink(p, {
        lifecycle: 'lost',
        converted: null,
        stage_id: null,
        due: null,
      }),
      count: lost,
      active: p.lifecycle === 'lost',
    },
  ];

  const may = (permission: string, moduleKey?: string) =>
    canAccess(s.context, {
      organizationId: s.org,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });

  const nav: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  ];
  nav.push({
    label: 'CRM',
    href: base,
    icon: 'leads',
    children: [
      { label: 'All Leads', href: base },
      { label: 'Follow-ups', href: '/dashboard/crm/followups' },
      { label: 'Site Visits', href: '/dashboard/crm/site-visits' },
      ...(s.allowed('lead.create')
        ? [
            { label: 'Upload Leads', href: base + '/upload' },
            { label: 'Google Sheets', href: base + '/google-sheets' },
          ]
        : []),
      ...(s.allowed('crm.pipeline.manage')
        ? [{ label: 'CRM Settings', href: '/dashboard/crm/settings' }]
        : []),
    ],
  });
  if (may('quotation.view', 'quotation'))
    nav.push({
      label: 'Quotations',
      href: '/dashboard/quotations',
      icon: 'quotations',
    });
  if (may('project.view', 'projects'))
    nav.push({
      label: 'Projects',
      href: '/dashboard/projects',
      icon: 'projects',
    });
  if (may('customer.view', 'crm') || may('customer.view', 'quotation'))
    nav.push({
      label: 'Clients',
      href: '/dashboard/customers',
      icon: 'clients',
    });
  if (may('purchase.view'))
    nav.push({
      label: 'Marketplace',
      href: '/dashboard/marketplace',
      icon: 'marketplace',
    });
  if (may('invoice.view', 'billing'))
    nav.push({
      label: 'Billing & Invoices',
      href: '/dashboard/billing',
      icon: 'billing',
    });
  if (may('report.view'))
    nav.push({ label: 'Reports', href: '/dashboard/reports', icon: 'reports' });
  if (may('team.view'))
    nav.push({ label: 'Team', href: '/dashboard/company/team', icon: 'team' });
  if (may('organization.view'))
    nav.push({
      label: 'Company Settings',
      href: '/dashboard/company/settings',
      icon: 'settings',
    });

  const displayName =
    (user.email ?? '')
      .split('@')[0]
      ?.split(/[._-]/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .slice(0, 2)
      .join(' ') || 'Owner';
  const plan = plans?.find((item) => item.id === organization.plan_id);
  const propulseConnection: ProPulseConnectionView = {
    connected: false,
    email: '',
    name: '',
    lastSyncedAt: null,
    canManage: may('crm.source.manage') && may('crm.pipeline.manage'),
    configured: false,
  };
  try {
    const admin = createOwnerProvisioningDatabase();
    const { data, error } = await admin
      .from('propulse_lead_connections')
      .select('display_email,display_name,last_synced_at')
      .eq('organization_id', s.org)
      .maybeSingle();
    if (!error) {
      propulseConnection.configured = true;
      if (data) {
        propulseConnection.connected = true;
        propulseConnection.email = data.display_email;
        propulseConnection.name = data.display_name;
        propulseConnection.lastSyncedAt = data.last_synced_at;
      }
    }
  } catch {
    // Do not stop the CRM if an optional integration has not been deployed.
  }

  const stats = [
    {
      label: 'Total Leads',
      value: total === null ? '—' : number.format(total),
      note: 'All company leads',
      icon: 'leads' as const,
      tone: 'blue',
    },
    {
      label: 'New Today',
      value: newToday === null ? '—' : number.format(newToday),
      note: 'Created today',
      icon: 'plus' as const,
      tone: 'purple',
    },
    {
      label: 'Follow-ups Due',
      value:
        dueToday === null || overdue === null
          ? '—'
          : number.format(dueToday + overdue),
      note:
        overdue === null ? 'Unavailable' : 'Overdue: ' + number.format(overdue),
      icon: 'calendar' as const,
      tone: 'rose',
    },
    {
      label: 'Converted',
      value: converted === null ? '—' : number.format(converted),
      note: 'Converted to projects',
      icon: 'check' as const,
      tone: 'green',
    },
    {
      label: 'Lost',
      value: lost === null ? '—' : number.format(lost),
      note: 'Closed lost',
      icon: 'close' as const,
      tone: 'orange',
    },
  ];

  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={displayName}
      accountEmail={user.email ?? ''}
      planLabel={plan?.name ?? 'Business plan'}
      navigation={nav}
      search=""
      currentHref="/dashboard/crm/leads"
      notificationsEnabled={may('notification.view')}
    >
      <LeadsWorkspace
        rows={rows}
        propulseConnection={propulseConnection}
        initialTool={
          p.panel === 'add' || p.panel === 'propulse' ? p.panel : 'none'
        }
        stats={stats}
        tabs={tabs}
        stages={stages}
        sources={sources}
        services={services}
        assignees={assignees}
        branches={branches}
        lostReasons={reasons}
        params={p}
        count={result.total}
        page={page}
        prevHref={page > 1 ? searchLink(p, { page: String(page - 1) }) : null}
        nextHref={
          page * 25 < result.total
            ? searchLink(p, { page: String(page + 1) })
            : null
        }
        canCreate={s.allowed('lead.create')}
        canConfigureCrm={
          s.allowed('crm.source.manage') && s.allowed('crm.pipeline.manage')
        }
        canManage={s.allowed('lead.manage')}
        canAssign={s.allowed('lead.assign')}
        canWin={s.allowed('lead.win')}
        canNote={s.allowed('crm.activity.create')}
        canConvert={s.allowed('lead.convert')}
        canQuote={s.allowed('quotation.create', 'quotation')}
        organizationName={organization.name}
        timeZone={organization.default_timezone || 'Asia/Kolkata'}
        asOf={new Date().toISOString()}
      />
    </OwnerShell>
  );
}
