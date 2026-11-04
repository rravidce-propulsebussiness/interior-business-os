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
  if (has('notification.view'))
    items.push({
      label: 'My Work',
      href: '/dashboard/work',
      icon: 'calendar',
    });
  if (has('lead.view', 'crm'))
    items.push({
      label: 'Leads',
      href: '/dashboard/crm/leads',
      icon: 'leads',
    });
  if (has('website.view', 'website'))
    items.push({
      label: 'Website Studio',
      href: '/dashboard/website',
      icon: 'globe',
    });
  if (has('brochure.view', 'brochure'))
    items.push({
      label: 'Brochures',
      href: '/dashboard/brochures',
      icon: 'quotations',
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
  if (has('project.view', 'projects'))
    items.push({
      label: 'Project Management',
      href: '/dashboard/project-management',
      icon: 'projects',
      children: [
        { label: 'Portfolio Overview', href: '/dashboard/project-management' },
        { label: 'Projects', href: '/dashboard/projects' },
        ...(has('task.view', 'projects')
          ? [
              has('execution.view', 'projects')
                ? {
                    label: 'Task Board',
                    href: '/dashboard/project-management/tasks',
                  }
                : {
                    label: 'Task Register',
                    href: '/dashboard/operations/project_tasks',
                  },
            ]
          : []),
        ...(has('milestone.view', 'projects')
          ? [
              {
                label: 'Milestones',
                href: '/dashboard/operations/project_milestones',
              },
            ]
          : []),
      ],
    });
  else if (context.entitlements.includes('projects'))
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
      label: 'Site Operations',
      href: '/dashboard/operations',
    });
  if (has('estimate.view', 'projects'))
    erpChildren.push({
      label: 'Estimates & Materials',
      href: '/dashboard/execution',
    });
  if (
    has('purchase_order.view', 'projects') &&
    context.entitlements.includes('purchasing')
  )
    erpChildren.push({
      label: 'Procurement',
      href: '/dashboard/execution/purchase_orders',
    });
  if (
    has('inventory.view', 'projects') &&
    context.entitlements.includes('purchasing')
  )
    erpChildren.push({
      label: 'Inventory & Stock',
      href: '/dashboard/operations/stock',
    });
  if (has('inspection.view', 'projects'))
    erpChildren.push({
      label: 'Quality Inspections',
      href: '/dashboard/operations/project_inspections',
    });
  if (has('handover.view', 'projects'))
    erpChildren.push({
      label: 'Handover',
      href: '/dashboard/operations/handover_records',
    });
  if (erpChildren.length)
    items.push({
      label: 'ERP Operations',
      href: erpChildren[0]!.href,
      icon: 'projects',
      children: erpChildren,
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
  // Billing & Plans is the company subscription page, not the customer invoice register.
  if (has('organization.view') || has('invoice.view', 'billing'))
    items.push({
      label: 'Billing & Plans',
      href: '/dashboard/billing',
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
  if (has('automation.view'))
    items.push({
      label: 'Automations',
      href: '/dashboard/automations',
      icon: 'settings',
    });
  if (has('team.manage'))
    items.push({
      label: 'Employees',
      href: '/dashboard/employees',
      icon: 'team',
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
  return items;
}
