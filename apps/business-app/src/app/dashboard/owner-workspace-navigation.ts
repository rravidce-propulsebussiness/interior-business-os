import 'server-only';
import { canAccess } from '@business-os/auth';
import type { TenantAccessContext } from '@business-os/core';
import type { OwnerNavItem } from './owner-shell';

/**
 * Only one menu definition for every Business OS company workspace.
 * The current active membership, granted permissions and entitlements
 * determine what appears. Pages should never handcraft sidebar modules.
 */
export function ownerWorkspaceNavigation(context: TenantAccessContext | null): OwnerNavItem[] {
  const items: OwnerNavItem[] = [{ label: 'Dashboard', href: '/dashboard', icon: 'dashboard' }];
  if (!context) return items;
  // Growth and direct Basic customers have a website-first workspace.
  // Paid OS modules remain separately guarded by server permissions/RLS.
  const websiteOnly = context.entitlements.includes('website') &&
    !['projects','crm','quotation','billing','finance','operations','execution']
      .some((key) => context.entitlements.includes(key));
  if (websiteOnly) return [
    { label: 'Website', href: '/dashboard/website', icon: 'globe' },
    { label: 'Billing & Plans', href: '/dashboard/billing', icon: 'billing' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ];
  const has = (permission:string, moduleKey?:string) =>
    canAccess(context, {
      organizationId:context.organizationId,permission,
      ...(moduleKey ? {moduleKey} : {}),
    });
  if (has('lead.view','crm')) items.push({
    label:'Leads',href:'/dashboard/crm/leads',icon:'leads',
  });
  if (has('quotation.view','quotation')) items.push({
    label:'Quotations',href:'/dashboard/quotations',icon:'quotations',
    children:[
      ...(has('quotation.create','quotation')?[{label:'Create Quote',href:'/dashboard/quotations/new'}]:[]),
      {label:'My Quotes',href:'/dashboard/quotations'},
      {label:'Packages',href:'/dashboard/quotations/packages'},
    ],
  });
  if (has('project.view','projects')) items.push({
    label:'Projects',href:'/dashboard/projects',icon:'projects',
  });
  else if (context.entitlements.includes('projects')) items.push({
    label:'My Sites',href:'/dashboard/site-projects',icon:'projects',
  });
  if (has('purchase.view')) {
    items.push({label:'Marketplace',href:'/dashboard/marketplace',icon:'marketplace'});
    items.push({label:'Purchases',href:'/dashboard/marketplace/orders',icon:'purchases'});
  }
  if (has('invoice.view','billing')) items.push({
    label:'Finance',href:'/dashboard/finance',icon:'billing',
  });
  // Billing & Plans is the company subscription page, not the customer invoice register.
  if (has('organization.view') || has('invoice.view','billing')) items.push({
    label:'Billing & Plans',href:'/dashboard/billing',icon:'billing',
  });
  if (has('report.view') || has('report.financial') ||
      has('financial_report.view','billing')) items.push({
    label:'Reports',href:'/dashboard/reports',icon:'reports',
  });
  if (has('team.manage')) items.push({
    label:'Employees',href:'/dashboard/employees',icon:'team',
  });
  if (has('team.view') || has('role.view')) items.push({
    label:'Team',href:'/dashboard/company/team',icon:'team',
  });
  if (has('website.view','website')) items.push({
    label:'Website',href:'/dashboard/website',icon:'globe',
  });
  if (has('organization.view')) items.push({
    label:'Settings',href:'/dashboard/settings',icon:'settings',
  });
  return items;
}
