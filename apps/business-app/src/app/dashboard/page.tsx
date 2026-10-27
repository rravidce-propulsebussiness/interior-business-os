/* eslint-disable @next/next/no-html-link-for-pages -- Intentional full-document navigation avoids incomplete RSC Flight streams on Hostinger. */
import { notFound, redirect } from 'next/navigation';
import {
  pageServices,
  activeOrganization,
  workspaceScope,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { DomainError } from '@business-os/shared';
import { createCrmRepository } from '@business-os/database/crm';
import { createQuotationRepository } from '@business-os/database/quotations';
import { createGstRepository } from '@business-os/database/gst';
import { commercialSearchResultSchema } from '@business-os/core/commercial';
import { resultSchema } from './crm/service';
import { OwnerShell, type OwnerNavItem } from './owner-shell';
import {
  CommandCentre,
  type CommandAction,
  type CommandAttention,
  type CommandDocument,
  type CommandMetric,
  type CommandProject,
} from './command-centre';
import { leadsNavigation } from './leads-navigation';
import { workCompletionByProject } from './projects/work-progress';
import './owner-dashboard.css';
import './command-centre.css';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string };
type SiteProject = { id: string; stage: string; role: string };

const number = new Intl.NumberFormat('en-IN');
const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emailDisplayName(email: string): string {
  const identifier =
    email.split('@')[0]?.split(/[._-]/).filter(Boolean).slice(0, 2) ?? [];
  return identifier.map((word) => titleCase(word)).join(' ') || 'there';
}

async function optional<T>(value: PromiseLike<T>): Promise<T | null> {
  try {
    return await value;
  } catch {
    // A disabled or temporarily unavailable feature should not crash the
    // entire company dashboard. No data is represented as unavailable.
    return null;
  }
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { authorization, repository, client } = await pageServices();
  const user = await authorization.requireAuthenticatedUser();
  const scope = await workspaceScope();

  // Platform Admin is a separate workspace. A company owner never gains
  // platform access merely because they are the only person in a business.
  let isPlatformAdmin = false;
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
    await authorization.requirePlatformPermission('platform.catalog.view');
    isPlatformAdmin = true;
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'FORBIDDEN'))
      throw error;
  }
  if (isPlatformAdmin && !scope) redirect('/admin');

  let context: Awaited<ReturnType<typeof activeOrganization>> = null;
  try {
    context = await activeOrganization();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }

  if (!context) {
    if (scope) notFound();
    return (
      <main id="main-content" className="owner-no-company">
        <h1>No active company workspace</h1>
        <p>
          Create a business workspace to start using the tools, or accept an
          invitation to join an existing company.
        </p>
        <a href="/dashboard/company/apply">Create your company →</a>
        <a href="/auth/propulse">
          Already registered on ProPulse? Import your company →
        </a>
        <a href="/dashboard/company/invitations">Join an invited company →</a>
      </main>
    );
  }

  const organization = await repository.organization(context.organizationId);
  if (!organization) notFound();
  if (
    !scope &&
    process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED === 'true' &&
    organization.slug
  ) {
    redirect('/' + organization.slug + '/dashboard');
  }

  const orgId = context.organizationId;
  const has = (permission: string, moduleKey?: string) =>
    canAccess(context, {
      organizationId: orgId,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  const canLeads = has('lead.view', 'crm');
  const canQuotes = has('quotation.view', 'quotation');
  const canProjects = has('project.view', 'projects');
  const canClients =
    has('customer.view', 'quotation') || has('customer.view', 'crm');
  const canMarketplace = has('purchase.view');
  const canBilling = has('invoice.view', 'billing');
  const canReports =
    has('report.view') ||
    has('report.financial') ||
    has('financial_report.view', 'billing');
  const canTeam = has('team.view');
  const canInvite = has('team.invite') && has('role.manage');
  const canWebsite = has('website.view', 'website');
  const canSettings = has('organization.view');
  const canSites = context.entitlements.includes('projects');

  // The hosted website is the primary destination for website-only plans.
  // Full Business OS owners keep the cross-module command centre.
  const operationalModules = ['crm','quotation','projects','billing','purchasing','reports']
    .some((key) => context.entitlements.includes(key));
  if (canWebsite && !operationalModules && !scope) redirect('/dashboard/website');
  if (!canWebsite && !operationalModules && !scope)
    redirect('/dashboard/billing');

  const query = (await searchParams).q?.trim().slice(0, 80) ?? '';

  // Fetch only the active company's data, with its existing server/RLS guards.
  const [
    rawLeads,
    rawQuotes,
    rawProjects,
    rawInvoices,
    rawBills,
    rawDueLeads,
    rawResponses,
    rawTeam,
    rawPlans,
    rawSites,
  ] = await Promise.all([
    canLeads
      ? optional(
          createCrmRepository(client, orgId).search(
            'leads',
            { sort: 'newest', ...(query ? { q: query } : {}) },
            1,
          ),
        )
      : Promise.resolve(null),
    canQuotes
      ? optional(
          createQuotationRepository(client).search(orgId, 'quotations', query),
        )
      : Promise.resolve(null),
    canProjects
      ? optional(
          createQuotationRepository(client).search(
            orgId,
            'projects',
            query,
            1,
            'active',
          ),
        )
      : Promise.resolve(null),
    canBilling
      ? optional(createGstRepository(client).list(orgId, 'sales_invoice'))
      : Promise.resolve(null),
    canBilling
      ? optional(createGstRepository(client).list(orgId, 'purchase_bill'))
      : Promise.resolve(null),
    canLeads && !query
      ? optional(createCrmRepository(client, orgId).search('leads', { due: 'today', sort: 'newest' }, 1))
      : Promise.resolve(null),
    canQuotes && has('quotation.customer_response.view', 'quotation') && !query
      ? optional(client.rpc('quotation_response_queue', {
          p_organization_id: orgId,
          p_status: 'awaiting',
          p_page: 1,
        }))
      : Promise.resolve(null),
    canTeam ? optional(repository.team(orgId)) : Promise.resolve(null),
    optional(repository.plans()),
    canSites
      ? optional(
          client.rpc('project_site_my_projects', { p_organization_id: orgId }),
        )
      : Promise.resolve(null),
  ]);

  const leadResult = rawLeads ? resultSchema.safeParse(rawLeads) : null;
  const quoteResult = rawQuotes
    ? commercialSearchResultSchema.safeParse(rawQuotes)
    : null;
  const projectResult = rawProjects
    ? commercialSearchResultSchema.safeParse(rawProjects)
    : null;
  const leads = leadResult?.success ? leadResult.data : null;
  const quotes = quoteResult?.success ? quoteResult.data : null;
  const projects = projectResult?.success ? projectResult.data : null;
  const invoices = Array.isArray(rawInvoices) ? rawInvoices : null;
  const bills = Array.isArray(rawBills) ? rawBills : null;
  const dueResult = rawDueLeads ? resultSchema.safeParse(rawDueLeads) : null;
  const dueLeads = dueResult?.success ? dueResult.data : null;
  const responseResult = rawResponses && !rawResponses.error ? resultSchema.safeParse(rawResponses.data) : null;
  const responseQueue = responseResult?.success ? responseResult.data : null;
  const team = Array.isArray(rawTeam) ? rawTeam : null;
  const sites: SiteProject[] =
    rawSites && !rawSites.error && Array.isArray(rawSites.data)
      ? rawSites.data.filter(
          (site: unknown): site is SiteProject =>
            typeof site === 'object' &&
            site !== null &&
            'id' in site &&
            typeof site.id === 'string' &&
            'stage' in site &&
            typeof site.stage === 'string' &&
            'role' in site &&
            typeof site.role === 'string',
        )
      : [];
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const plan = rawPlans?.find((item) => item.id === organization.plan_id);
  const planLabel = plan?.key === 'website_unsubscribed' && canWebsite
    ? 'Website Basic (active)'
    : plan?.key === 'propulse_managed'
    ? context.entitlements.includes('projects') ? 'ProPulse Scale'
      : context.entitlements.includes('website') ? 'ProPulse Growth'
        : 'ProPulse membership inactive'
    : plan?.name || 'Business plan';
  const accountEmail = user.email ?? '';
  const accountLabel = emailDisplayName(accountEmail);

  const month = new Date().toISOString().slice(0, 7);
  const issuedThisMonth = invoices?.filter(
    (doc) => doc.status === 'issued' && doc.date.startsWith(month),
  );
  const invoiceTotal = issuedThisMonth?.reduce(
    (sum, document) => sum + Number(document.total || 0),
    0,
  );
  const navigation: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  ];
  if (canLeads)
    navigation.push(
      leadsNavigation({
        canCreate: has('lead.create', 'crm'),
        canManage: has('crm.pipeline.manage'),
      }),
    );
  if (canQuotes)
    navigation.push({
      label: 'Quotations',
      href: '/dashboard/quotations',
      icon: 'quotations',
      children: [
        ...(has('quotation.create', 'quotation')
          ? [{ label: 'Create Quote', href: '/dashboard/quotations/new' }]
          : []),
        { label: 'My Quotes', href: '/dashboard/quotations' },
        { label: 'Packages', href: '/dashboard/quotations/packages' },

      ],
    });
  if (canProjects)
    navigation.push({
      label: 'Projects',
      href: '/dashboard/projects',
      icon: 'projects',
    });
  else if (canSites)
    navigation.push({
      label: 'My Sites',
      href: '/dashboard/site-projects',
      icon: 'projects',
    });
  if (canClients)
    navigation.push({
      label: 'Clients',
      href: '/dashboard/customers',
      icon: 'clients',
    });
  if (canMarketplace) {
    navigation.push({
      label: 'Marketplace',
      href: '/dashboard/marketplace',
      icon: 'marketplace',
    });
    navigation.push({
      label: 'Purchases',
      href: '/dashboard/marketplace/orders',
      icon: 'purchases',
    });
  }
  if (canBilling) {
    navigation.push({
      label: 'Finance',
      href: '/dashboard/finance',
      children: [
        { label: 'Invoices', href: '/dashboard/finance?tab=invoices' },
        { label: 'Expenses', href: '/dashboard/finance?tab=expenses' },
        { label: 'GST', href: '/dashboard/finance?tab=gst' },
        { label: 'Salaries', href: '/dashboard/finance?tab=salaries' },
      ],
      icon: 'billing',
    });
    navigation.push({
      label: 'Billing & Plans',
      href: '/dashboard/billing',
      icon: 'billing',
    });
  }
  if (canReports)
    navigation.push({
      label: 'Reports',
      href: '/dashboard/reports',
      icon: 'reports',
    });
  if (canTeam || has('role.view'))
    navigation.push({
      label: 'Team',
      href: '/dashboard/company/team',
      icon: 'team',
    });
  if (canWebsite)
    navigation.push({
      label: 'Website',
      href: '/dashboard/website',
      icon: 'globe',
    });
  if (canSettings)
    navigation.push({
      label: 'Settings',
      href: '/dashboard/settings',
      icon: 'settings',
    });

  // The dashboard summarizes existing modules; it does not duplicate their
  // creation forms or show a second set of navigation tiles.
  const actions: CommandAction[] = [];
  if (canTeam || canInvite || has('role.view'))
    actions.push({
      title: 'Team Management',
      detail: 'Members and access',
      href: '/dashboard/company/team',
      icon: 'team',
    });
  if (has('invoice.create', 'billing'))
    actions.push(
      {
        title: 'Expense Entry',
        detail: 'Record company expenses',
        href: '/dashboard/billing/new?kind=purchase_bill',
        icon: 'expenses',
      },
      {
        title: 'Invoice Creation',
        detail: 'Create customer invoices',
        href: '/dashboard/billing/new?kind=sales_invoice',
        icon: 'billing',
      },
    );
  if (canProjects || canSites)
    actions.push({
      title: 'Project Management',
      detail: 'Track work and updates',
      href: canProjects ? '/dashboard/projects' : '/dashboard/site-projects',
      icon: 'projects',
    });

  const money = (amount: number) =>
    Number.isFinite(amount) ? rupees.format(amount) : '—';
  const validTotal = (value: number) =>
    Number.isFinite(value) ? value : 0;
  const months = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (6 - index));
    return {
      key: date.toISOString().slice(0, 7),
      name: new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(date),
    };
  });
  const monthTotals = months.map(({ key, name }) => ({
    name,
    total: invoices?.filter((document) => document.status === 'issued' && document.date.startsWith(key))
      .reduce((sum, document) => sum + validTotal(Number(document.total)), 0) ?? 0,
  }));
  const recordedThisMonth = bills?.filter((document) =>
    document.status === 'recorded' && document.date.startsWith(month),
  );
  const monthlyExpenses = recordedThisMonth?.reduce(
    (sum, document) => sum + validTotal(Number(document.total)), 0,
  );
  const activeMembers = team?.filter((member) => member.status === 'active') ?? [];
  const outstandingDescription = invoices === null
    ? 'Billing unavailable'
    : 'Check billing balances';
  const metrics: CommandMetric[] = [];
  if (canLeads)
    metrics.push({
      title: query ? 'Matching Leads' : 'Total Leads',
      value: leads ? number.format(leads.total) : '—',
      detail: query ? 'Search results' : 'All enquiries',
      href: '/dashboard/crm/leads',
      icon: 'leads',
      tone: 'orange',
    });
  if (canQuotes)
    metrics.push({
      title: query ? 'Matching Quotes' : 'Quotations',
      value: quotes ? number.format(quotes.total) : '—',
      detail: 'Company quotations',
      href: '/dashboard/quotations',
      icon: 'quotations',
      tone: 'blue',
    });
  if (canProjects)
    metrics.push({
      title: 'Active Projects',
      value: projects ? number.format(projects.total) : '—',
      detail: 'Ongoing work',
      href: '/dashboard/projects',
      icon: 'projects',
      tone: 'green',
    });
  if (canBilling)
    metrics.push({
      // A GST document register does not expose amounts collected or unpaid
      // balances, so it must never claim that issued totals are "payments due".
      title: 'Payments Due',
      value: '—',
      detail: outstandingDescription,
      href: '/dashboard/finance',
      icon: 'expenses',
      tone: 'orange',
    });

  const attention: CommandAttention[] = [];
  if (canLeads && dueLeads) {
    if (dueLeads.total > 0) {
      attention.push({
        title: number.format(dueLeads.total) + ' follow-up' + (dueLeads.total === 1 ? '' : 's') + ' due today',
        detail: 'Open the follow-up queue',
        status: 'Due today',
        tone: 'urgent',
        icon: 'leads',
        href: '/dashboard/crm/followups',
      });
    }
  }
  if (canQuotes && responseQueue && responseQueue.total > 0) {
    attention.push({
      title: number.format(responseQueue.total) + ' quotation' + (responseQueue.total === 1 ? '' : 's') + ' awaiting reply',
      detail: 'Final quotation needs a response',
      status: 'Waiting',
      tone: 'pending',
      icon: 'quotations',
      href: '/dashboard/quotations',
    });
  }
  if (canBilling && invoices?.some((document) => document.status === 'draft')) {
    attention.push({
      title: number.format(invoices.filter((document) => document.status === 'draft').length) + ' draft invoice' +
        (invoices.filter((document) => document.status === 'draft').length === 1 ? '' : 's'),
      detail: 'Ready for review before issue',
      status: 'Draft',
      tone: 'neutral',
      icon: 'billing',
      href: '/dashboard/finance?tab=invoices',
    });
  }

  const homeProjectRows = (projects?.rows ?? []).slice(0, 3);
  const homeProjectIds = homeProjectRows.map((project) => project.id);
  const homeTasks = homeProjectIds.length
    ? await client.from('project_tasks')
        .select('project_id,status,completion_percentage,weight')
        .eq('organization_id', orgId)
        .in('project_id', homeProjectIds)
        .limit(1000)
    : null;
  // PostgREST may cap responses at 1000 rows. A capped or failed query
  // cannot safely be shown as an accurate total.
  const workProgress = workCompletionByProject(
    homeProjectIds,
    !homeTasks?.error && homeTasks?.data && homeTasks.data.length < 1000
      ? homeTasks.data
      : null,
  );
  const commandProjects: CommandProject[] = homeProjectRows.map((project) => {
    const stage = siteById.get(project.id)?.stage || 'not_started';
    return {
      id: project.id,
      name: project.name || 'Project',
      stage,
      status: project.status,
      step: workProgress.get(project.id) ?? null,
    };
  });
  const mapDocument = (document: {
    id: string;
    partyName: string;
    number: string | null;
    date: string;
    total: number;
    status: string;
  }): CommandDocument => ({
    id: document.id,
    party: document.partyName || 'Company document',
    number: document.number || '',
    date: document.date,
    total: money(Number(document.total)),
    status: document.status,
  });
  const recentInvoices = (invoices ?? [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map(mapDocument);
  const recentExpenses = (bills ?? [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map(mapDocument);
  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: organization.default_timezone || 'Asia/Kolkata',
  }).format(new Date());
  const mobileNav = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' as const },
    ...(canProjects ? [{ label: 'Projects', href: '/dashboard/projects', icon: 'projects' as const }] : []),
    ...(canBilling ? [{ label: 'Finance', href: '/dashboard/finance', icon: 'billing' as const }] : []),
    ...(canTeam ? [{ label: 'Team', href: '/dashboard/company/team', icon: 'team' as const }] : []),
    ...(canSettings ? [{ label: 'Settings', href: '/dashboard/settings', icon: 'settings' as const }] : []),
  ];

  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={accountLabel}
      accountEmail={accountEmail}
      planLabel={planLabel}
      navigation={navigation}
      search={query}
      notificationsEnabled={has('notification.view')}
      dashboardBrand
    >
      <CommandCentre
        accountLabel={accountLabel}
        dateLabel={dateLabel}
        metrics={metrics}
        actions={actions}
        attention={attention}
        projects={commandProjects}
        finance={canBilling ? {
          invoiced: invoiceTotal === undefined ? '—' : money(invoiceTotal),
          expenses: monthlyExpenses === undefined ? '—' : money(monthlyExpenses),
          issuedCount: issuedThisMonth ? number.format(issuedThisMonth.length) : '—',
          recordedCount: recordedThisMonth ? number.format(recordedThisMonth.length) : '—',
          graph: monthTotals,
        } : null}
        team={canTeam ? { active: team ? activeMembers.length : null, total: team?.length ?? null } : null}
        invoices={recentInvoices}
        expenses={recentExpenses}
        navigation={mobileNav}
      />
    </OwnerShell>
  );
}
