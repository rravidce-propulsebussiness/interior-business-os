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
const sharedShellStyles = file('./owner-shell-global.css');
const routeSpecificStyles = file('./command-centre.css');

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

  it('keeps BOQ & Estimating separate from Project Management', () => {
    for (const name of [
      'Dashboard',
      'Leads',
      'Quotations',
      'Projects',
      'BOQ & Estimating',
      'Manual BOQ',
      'BOQ Rates',
      'Automations',
      'ERP: Site Execution',
      'Marketplace',
      'Purchases',
      'Finance',
      'Reports',
      'Team',
      'Website Studio',
      'Settings',
    ]) {
      expect(canonical).toContain(`label: '${name}'`);
    }
    expect(canonical).not.toContain("label: 'All Projects'");
    expect(canonical).toContain("if (has('project.view', 'projects'))");
    expect(canonical).toContain("label: 'Projects'");
    expect(canonical).not.toContain("label: 'Billing & Plans'");
    expect(canonical).not.toContain("href: '/dashboard/billing'");
    expect(canonical).toMatch(
      /label: 'Finance',\s*href: '\/dashboard\/finance'/,
    );
    const menuOrder = [
      'Dashboard',
      'Leads',
      'Quotations',
      'BOQ & Estimating',
      'Finance',
      'Projects',
      'Marketplace',
    ];
    const orderStart = canonical.indexOf('const navigationOrder = [');
    const orderEnd = canonical.indexOf('];', orderStart);
    const navigationOrderSource = canonical.slice(orderStart, orderEnd);
    let previousIndex = -1;
    for (const label of menuOrder) {
      const index = navigationOrderSource.indexOf(`'${label}'`);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(canonical).not.toContain("href: '/dashboard/company/settings'");
    expect(canonical).not.toContain("label: 'Clients'");
  });

  it('matches ERP link permission and entitlement checks at destination', () => {
    expect(canonical).toContain("has('execution.view', 'projects')");
    expect(canonical).toContain("has('estimate.view', 'projects')");
    expect(canonical).toContain("has('purchase_order.view', 'projects')");
    expect(canonical).toContain("has('inventory.view', 'projects')");
    expect(canonical).toContain("has('inspection.view', 'projects')");
    expect(canonical).toContain("has('handover.view', 'projects')");
    expect(canonical).toContain("context.entitlements.includes('purchasing')");
    for (const href of [
      '/dashboard/operations',
      '/dashboard/execution/boq',
      '/dashboard/execution/boq/pricing',
      '/dashboard/execution/purchase_orders',
      '/dashboard/operations/stock',
      '/dashboard/operations/project_inspections',
      '/dashboard/operations/handover_records',
    ]) {
      expect(canonical).toContain(`href: '${href}'`);
    }
    expect(canonical).toContain('projectChildren.push(...erpChildren)');
    expect(canonical).toContain('boqChildren.push');
    expect(canonical).toContain("label: 'BOQ & Estimating'");
    expect(canonical).toContain(
      "if (!has('project.view', 'projects') && projectChildren.length)",
    );
    expect(canonical).not.toContain("label: 'Construction ERP'");
    expect(canonical).not.toContain("label: 'My Work'");
    expect(canonical).toContain("has('project.view', 'projects')");
    expect(canonical).toContain("has('task.view', 'projects')");
    expect(canonical).toContain("has('milestone.view', 'projects')");
    expect(canonical).not.toContain("label: 'Brochures'");
    expect(canonical).toContain("has('automation.view')");
    expect(canonical).toMatch(
      /label: 'WhatsApp',[\s\S]*?href: '\/dashboard\/whatsapp',[\s\S]*?parentLink: true,[\s\S]*?label: 'Automations',[\s\S]*?href: '\/dashboard\/whatsapp\?tab=automations'/,
    );
    expect(shell).toContain('owner-nav-group-link');
    expect(canonical).toContain("has('catalog.view', 'catalog')");
    expect(canonical).toContain("has('pricing.view', 'pricing')");
    expect(canonical).toContain("label: 'Projects'");
    expect(canonical).toContain("href: '/dashboard/projects'");
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

  it('keeps agreement navigation in the project and quotation workflow', () => {
    expect(canonical).not.toContain("label: 'Agreements'");
    expect(canonical).not.toContain("href: '/dashboard/finance/contracts'");
    expect(canonical).toContain("label: 'Quotations'");
  });

  it('uses one sidebar skin on every company dashboard route', () => {
    expect(sharedShellStyles).toContain(
      '.owner-layout.owner-layout-unified .owner-sidebar {',
    );
    expect(routeSpecificStyles).not.toMatch(
      /\.owner-layout:has\([^\n]*\) \.owner-sidebar/,
    );
    expect(routeSpecificStyles).not.toMatch(
      /\.owner-layout:has\([^\n]*\) \.owner-nav-item/,
    );
    expect(routeSpecificStyles).not.toMatch(
      /\.owner-layout:has\([^\n]*\) \.owner-subnav/,
    );
  });
});
