import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const file = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const canonical = file('./owner-workspace-navigation.ts');
const layout = file('./layout.tsx');
const provider = file('./company-navigation-provider.tsx');
const shell = file('./owner-shell.tsx');
const studio = file('./quotations/studio-frame.tsx');
const finance = file('./finance/page.tsx');
const operations = file('./operations/page.tsx');

describe('one authorized company navigation on every dashboard page', () => {
  it('uses the shared permission-filtered menu from dashboard layout', () => {
    expect(layout).toContain('ownerWorkspaceNavigation(context)');
    expect(layout).toContain('<CompanyNavigationProvider');
    expect(canonical).toContain('canAccess(context');
    expect(canonical).toContain('context.organizationId');
    expect(provider).toContain('createContext<OwnerNavItem[] | null>');
    expect(shell).toContain(
      'const displayedNavigation = sharedNavigation ?? navigation',
    );
    expect(shell).toContain('displayedNavigation.map');
  });

  it('keeps project management and ERP destinations under one menu', () => {
    for (const name of [
      'Dashboard',
      'Leads',
      'Quotations',
      'Project Management',
      'Project Directory',
      'Automations',
      'Brochures',
      'My Work',
      'ERP: Site Execution',
      'ERP: Execution Planner',
      'ERP: BOQ & Estimate Revisions',
      'Marketplace',
      'Purchases',
      'Finance',
      'Billing & Plans',
      'Reports',
      'Team',
      'Website Studio',
      'Settings',
    ]) {
      expect(canonical).toContain(`label: '${name}'`);
    }
    expect(canonical).toMatch(
      /label: 'Billing & Plans',\s*href: '\/dashboard\/billing'/,
    );
    expect(canonical).toMatch(
      /label: 'Finance',\s*href: '\/dashboard\/finance'/,
    );
    expect(canonical).not.toContain("href: '/dashboard/company/settings'");
    expect(canonical).not.toContain("label: 'Clients'");
  });

  it('matches ERP link permission and entitlement checks at destination', () => {
    expect(canonical).toContain("has('execution.view', 'projects')");
    expect(canonical).toContain("has('estimate.view', 'projects')");
    expect(canonical).toContain("has('material.view', 'projects')");
    expect(canonical).toContain("has('estimate.manage_recipes', 'projects')");
    expect(canonical).toContain("has('purchase_order.view', 'projects')");
    expect(canonical).toContain("has('inventory.view', 'projects')");
    expect(canonical).toContain("has('inspection.view', 'projects')");
    expect(canonical).toContain("has('handover.view', 'projects')");
    expect(canonical).toContain("context.entitlements.includes('purchasing')");
    for (const href of [
      '/dashboard/operations',
      '/dashboard/execution/execution_estimate_revisions',
      '/dashboard/execution',
      '/dashboard/execution/materials',
      '/dashboard/execution/estimation_recipes',
      '/dashboard/execution/purchase_orders',
      '/dashboard/operations/stock',
      '/dashboard/operations/project_inspections',
      '/dashboard/operations/handover_records',
    ]) {
      expect(canonical).toContain(`href: '${href}'`);
    }
    expect(canonical).toContain('projectChildren.push(...erpChildren)');
    expect(canonical).toContain('if (projectChildren.length)');
    expect(canonical).not.toContain("label: 'Construction ERP'");
    expect(canonical).toContain("has('project.view', 'projects')");
    expect(canonical).toContain("has('task.view', 'projects')");
    expect(canonical).toContain("has('milestone.view', 'projects')");
    expect(canonical).toContain("has('brochure.view', 'brochure')");
    expect(canonical).toContain("has('automation.view')");
    expect(canonical).toContain("has('notification.view')");
    expect(canonical).toContain("has('catalog.view', 'catalog')");
    expect(canonical).toContain("has('pricing.view', 'pricing')");
    expect(canonical).toContain("href: '/dashboard/project-management'");
    expect(operations).toContain('currentHref="/dashboard/operations"');
    expect(canonical).not.toContain('window.location');
  });

  it('preserves the quotation studio and search behavior', () => {
    expect(studio).toContain('<OwnerShell');
    expect(studio).toContain('searchAction="/dashboard/quotations"');
    expect(studio).not.toContain('qs-sidebar-navigation');
    expect(shell).toContain('owner-layout-unified');
  });

  it('keeps finance tabs in the page instead of duplicate menu items', () => {
    expect(canonical).not.toContain("label: 'Salaries'");
    expect(canonical).not.toContain("label: 'GST'");
    expect(finance).toContain("tab === 'salaries'");
    expect(finance).toContain("tab === 'gst'");
  });
});
