/* eslint-disable @next/next/no-html-link-for-pages -- Use reliable full document navigation between dedicated CRM pages on Hostinger. */
import { OwnerShell, type OwnerNavItem } from '../../owner-shell';
import { crmServices } from '../service';
import { lookups } from '../lookups';
import { SheetImportForm } from './import/sheet-import-form';
import '../../owner-dashboard.css';
import './leads.css';

const leadsPath = '/dashboard/crm/leads';
const uploadPath = leadsPath + '/upload';
const googlePath = leadsPath + '/google-sheets';

/** Both dedicated import pages write into the same tenant-scoped CRM leads. */
export async function LeadImportPage({
  method,
}: {
  method: 'file' | 'google';
}) {
  const s = await crmServices('lead.create', true);
  const [choices, organization, user, plans] = await Promise.all([
    lookups(s, {}),
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.plans().catch(() => null),
  ]);
  if (!organization) throw new Error('Company workspace not available');

  const sources = choices.sources.rows
    .filter(
      (row) =>
        typeof row.id === 'string' &&
        typeof row.name === 'string' &&
        row.key !== 'propulse_marketplace',
    )
    .map((row) => ({ value: String(row.id), label: String(row.name) }));
  const stages = choices.stages.rows
    .filter(
      (row) =>
        typeof row.id === 'string' &&
        typeof row.name === 'string' &&
        row.outcome === 'open',
    )
    .map((row) => ({ value: String(row.id), label: String(row.name) }));

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
        { label: 'Upload Leads', href: uploadPath },
        { label: 'Google Sheets', href: googlePath },
        ...(s.allowed('crm.pipeline.manage')
          ? [{ label: 'CRM Settings', href: '/dashboard/crm/settings' }]
          : []),
      ],
    },
  ];
  if (s.allowed('quotation.view', 'quotation'))
    nav.push({
      label: 'Quotations',
      href: '/dashboard/quotations',
      icon: 'quotations',
    });
  if (s.allowed('project.view', 'projects'))
    nav.push({
      label: 'Projects',
      href: '/dashboard/projects',
      icon: 'projects',
    });
  if (
    s.allowed('customer.view', 'crm') ||
    s.allowed('customer.view', 'quotation')
  )
    nav.push({
      label: 'Clients',
      href: '/dashboard/customers',
      icon: 'clients',
    });
  if (s.allowed('report.view'))
    nav.push({ label: 'Reports', href: '/dashboard/reports', icon: 'reports' });
  if (s.allowed('team.view'))
    nav.push({ label: 'Team', href: '/dashboard/company/team', icon: 'team' });
  if (s.allowed('organization.view'))
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
      notificationsEnabled={s.allowed('notification.view')}
      currentHref={method === 'file' ? uploadPath : googlePath}
    >
      <main id="main-content" tabIndex={-1} className="crm-leads-root">
        <div className="crm-leads-breadcrumb">
          <a href="/dashboard">Workspace</a>
          <span>›</span>
          <a href={leadsPath}>CRM Leads</a>
          <span>›</span>
          <strong>
            {method === 'file' ? 'Upload Leads' : 'Google Sheets'}
          </strong>
        </div>
        <div className="crm-leads-heading">
          <div>
            <h1>{method === 'file' ? 'Upload Leads' : 'Google Sheets'}</h1>
            <p>
              {method === 'file'
                ? 'Import customer leads from a CSV file into your company CRM.'
                : 'Paste rows copied from Google Sheets into your company CRM.'}
            </p>
          </div>
          <a className="crm-outline" href={leadsPath}>
            ← All Leads
          </a>
        </div>
        <SheetImportForm
          method={method}
          sources={sources}
          stages={stages}
          canSetup={
            s.allowed('crm.source.manage') && s.allowed('crm.pipeline.manage')
          }
        />
      </main>
    </OwnerShell>
  );
}
