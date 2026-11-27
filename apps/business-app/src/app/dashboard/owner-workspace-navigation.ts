import 'server-only';
import { canAccess } from '@business-os/auth';
import type { TenantAccessContext } from '@business-os/core';
import type { OwnerNavItem } from './owner-shell';

/**
 * Only one menu definition for every Business OS company workspace.
 * The current active membership, granted permissions and entitlements
 * determine what appears. Pages should never handcraft sidebar modules.
 */
export function ownerWorkspaceNavigation(
  context: TenantAccessContext | null,
): OwnerNavItem[] {
  const items: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  ];
  if (!context) return items;
  const has = (permission: string, moduleKey?: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  if (has('lead.view', 'crm'))
    items.push({
      label: 'Leads',
      href: '/dashboard/crm/leads',
      icon: 'leads',
    });
  if (has('crm.source.manage', 'crm'))
    items.push({
      label: 'Meta Lead Ads',
      href: '/dashboard/meta-leads',
      icon: 'zap',
    });
  if (has('website.view', 'website'))
    items.push({
      label: 'Website Studio',
      href: '/dashboard/website',
      icon: 'globe',
    });
  if (has('quotation.view', 'quotation'))
    items.push({
      label: 'Quotations',
      href: '/dashboard/quotations',
      icon: 'quotations',
      children: [
        ...(has('quotation.create', 'quotation')
          ? [{ label: 'Create Quote', href: '/dashboard/quotations/new' }]
          : []),
        { label: 'My Quotes', href: '/dashboard/quotations' },
        { label: 'Packages', href: '/dashboard/quotations/packages' },
        ...(has('catalog.view', 'catalog') && has('pricing.view', 'pricing')
          ? [
              {
                label: 'Construction Pricing',
                href: '/dashboard/pricing/construction',
              },
            ]
          : []),
      ],
    });
  const projectChildren: NonNullable<OwnerNavItem['children']> = [];
  const boqChildren: NonNullable<OwnerNavItem['children']> = [];
  if (!has('project.view', 'projects') && has('task.view', 'projects'))
    projectChildren.push(
      has('execution.view', 'projects')
        ? {
            label: 'Task Board',
            href: '/dashboard/project-management/tasks',
          }
        : {
            label: 'Task Register',
            href: '/dashboard/operations/project_tasks',
          },
    );
  if (!has('project.view', 'projects') && has('milestone.view', 'projects'))
    projectChildren.push({
      label: 'Milestones',
      href: '/dashboard/operations/project_milestones',
    });
  if (
    !has('project.view', 'projects') &&
    context.entitlements.includes('projects')
  )
    items.push({
      label: 'My Sites',
      href: '/dashboard/site-projects',
      icon: 'projects',
    });
  // ERP is a view over the existing tenant-scoped execution services, not
  // a separate app or hostname. Match each destination's server permission
  // and extra module entitlements before showing a navigation link.
  const erpChildren: NonNullable<OwnerNavItem['children']> = [];
  if (has('execution.view', 'projects'))
    erpChildren.push({
      label: 'ERP: Site Execution',
      href: '/dashboard/operations',
    });
  if (has('estimate.view', 'projects')) {
    boqChildren.push({
      label: 'Manual BOQ',
      href: '/dashboard/execution/boq',
    });
  }
  if (has('estimate.view_cost', 'projects')) {
    boqChildren.push({
      label: 'BOQ Rates',
      href: '/dashboard/execution/boq/pricing',
    });
  }
  if (
    has('purchase_order.view', 'projects') &&
    context.entitlements.includes('purchasing')
  )
    erpChildren.push({
      label: 'ERP: Procurement',
      href: '/dashboard/execution/purchase_orders',
    });
  if (
    has('inventory.view', 'projects') &&
    context.entitlements.includes('purchasing')
  )
    erpChildren.push({
      label: 'ERP: Inventory & Stock',
      href: '/dashboard/operations/stock',
    });
  if (has('inspection.view', 'projects'))
    erpChildren.push({
      label: 'ERP: Quality Inspections',
      href: '/dashboard/operations/project_inspections',
    });
  if (has('handover.view', 'projects'))
    erpChildren.push({
      label: 'ERP: Handover',
      href: '/dashboard/operations/handover_records',
    });
  if (boqChildren.length)
    items.push({
      label: 'BOQ & Estimating',
      href: has('estimate.view', 'projects')
        ? '/dashboard/execution/boq'
        : '/dashboard/execution/boq/pricing',
      icon: 'calculator',
      children: boqChildren,
    });
  // Projects is the single entry for the single project flow. Specialist
  // execution destinations stay available only to staff who lack project view.
  if (has('project.view', 'projects')) {
    items.push({
      label: 'Projects',
      href: '/dashboard/projects',
      icon: 'projects',
    });
  } else {
    projectChildren.push(...erpChildren);
  }
  if (!has('project.view', 'projects') && projectChildren.length)
    items.push({
      label: 'Project Management',
      href: projectChildren[0]!.href,
      icon: 'projects',
      children: projectChildren,
    });
  if (has('purchase.view')) {
    items.push({
      label: 'Marketplace',
      href: '/dashboard/marketplace',
      icon: 'marketplace',
    });
    items.push({
      label: 'Purchases',
      href: '/dashboard/marketplace/orders',
      icon: 'purchases',
    });
  }
  if (has('invoice.view', 'billing'))
    items.push({
      label: 'Finance',
      href: '/dashboard/finance',
      icon: 'billing',
    });
  if (
    has('report.view') ||
    has('report.financial') ||
    has('financial_report.view', 'billing')
  )
    items.push({
      label: 'Reports',
      href: '/dashboard/reports',
      icon: 'reports',
    });
  if (has('automation.view')) {
    items.push({
      label: 'WhatsApp',
      href: '/dashboard/whatsapp',
      icon: 'message',
      parentLink: true,
      children: [
        {
          label: 'Automations',
          href: '/dashboard/whatsapp?tab=automations',
        },
      ],
    });
  }
  if (has('team.manage'))
    items.push({
      label: 'Employees',
      href: '/dashboard/employees',
      icon: 'idcard',
    });
  if (has('team.view') || has('role.view'))
    items.push({
      label: 'Team',
      href: '/dashboard/company/team',
      icon: 'team',
    });
  if (has('organization.view'))
    items.push({
      label: 'Settings',
      href: '/dashboard/settings',
      icon: 'settings',
    });
  // Keep the shared sidebar in the same product order on every dashboard route.
  const navigationOrder = [
    'Dashboard',
    'WhatsApp',
    'Leads',
    'Meta Lead Ads',
    'Quotations',
    'BOQ & Estimating',
    'Finance',
    'Projects',
    'Project Management',
    'My Sites',
    'Marketplace',
    'Purchases',
    'Website Studio',
    'Reports',
    'Employees',
    'Team',
    'Settings',
  ];
  const orderIndex = new Map(
    navigationOrder.map((label, index) => [label, index]),
  );
  items.sort(
    (left, right) =>
      (orderIndex.get(left.label) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(right.label) ?? Number.MAX_SAFE_INTEGER),
  );

  return items;
}
