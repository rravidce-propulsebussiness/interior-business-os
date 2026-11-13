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
        ...(context.entitlements.includes('projects') &&
          (has('contract.view', 'billing') || has('contract.create', 'billing'))
          ? [{ label: 'Agreements', href: '/dashboard/finance/contracts' }]
          : []),
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
  if (has('project.view', 'projects'))
    projectChildren.push(
      { label: 'Portfolio Overview', href: '/dashboard/project-management' },
      { label: 'All Projects', href: '/dashboard/projects' },
    );
  if (has('task.view', 'projects'))
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
  if (has('milestone.view', 'projects'))
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
      label: 'BOQ & Estimate Revisions',
      href: '/dashboard/execution/execution_estimate_revisions',
    });
    erpChildren.push({
      label: 'ERP: Execution Planner',
      href: '/dashboard/execution',
    });
  }
  if (has('material.view', 'projects'))
    erpChildren.push({
      label: 'ERP: Materials',
      href: '/dashboard/execution/materials',
    });
  if (has('estimate.manage_recipes', 'projects'))
    boqChildren.push({
      label: 'Rate Recipes',
      href: '/dashboard/execution/estimation_recipes',
    });
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
        ? '/dashboard/execution/execution_estimate_revisions'
        : '/dashboard/execution/estimation_recipes',
      icon: 'quotations',
      children: boqChildren,
    });
  // One project path: All Projects → project → Timeline. Task boards,
  // milestones and ERP registers are reached from inside each project's
  // timeline and tabs, so they are not repeated in the menu for anyone who
  // can open projects. Staff without project access keep their own entry.
  if (has('project.view', 'projects'))
    projectChildren.splice(0, projectChildren.length, {
      label: 'All Projects',
      href: '/dashboard/projects',
    });
  else projectChildren.push(...erpChildren);
  if (projectChildren.length)
    items.push({
      label: 'Project Management',
      href: has('project.view', 'projects')
        ? '/dashboard/projects'
        : projectChildren[0]!.href,
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
  if (has('automation.view')) {
    items.push({
      label: 'WhatsApp',
      href: '/dashboard/whatsapp',
      icon: 'message',
    });
    items.push({
      label: 'Automations',
      href: '/dashboard/automations',
      icon: 'settings',
    });
  }
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
