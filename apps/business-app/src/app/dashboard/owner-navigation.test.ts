import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const file = (path:string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const canonical=file('./owner-workspace-navigation.ts');
const layout=file('./layout.tsx');
const provider=file('./company-navigation-provider.tsx');
const shell=file('./owner-shell.tsx');
const dashboard=file('./page.tsx');
const studio=file('./quotations/studio-frame.tsx');
const finance=file('./finance/page.tsx');

describe('one authorized company navigation on every dashboard page',()=>{
  it('provides the same permission-filtered navigation from dashboard layout',()=>{
    expect(layout).toContain('ownerWorkspaceNavigation(context)');
    expect(layout).toContain('<CompanyNavigationProvider');
    expect(canonical).toContain("canAccess(context");
    expect(canonical).toContain("context.organizationId");
    expect(provider).toContain('createContext<OwnerNavItem[] | null>');
    expect(shell).toContain('const displayedNavigation = sharedNavigation ?? navigation');
    expect(shell).toContain('displayedNavigation.map');
  });
  it('keeps every approved module in one source with canonical destinations',()=>{
    for (const name of [
      'Dashboard','Leads','Quotations','Projects','Clients',
      'Marketplace','Purchases','Finance','Billing & Plans',
      'Reports','Team','Website','Settings'
    ]) expect(canonical).toContain("label:'"+name+"'");
    expect(canonical).toContain("label:'Billing & Plans',href:'/dashboard/billing'");
    expect(canonical).toContain("label:'Finance',href:'/dashboard/finance'");
    expect(canonical).not.toContain("href:'/dashboard/company/settings'");
    expect(dashboard).toContain("label: 'Billing & Plans',\n      href: '/dashboard/billing'");
    expect(canonical).toContain("has('invoice.view','billing')");
  });
  it('avoids a second Quotation Studio menu and preserves its search',()=>{
    expect(studio).toContain('<OwnerShell');
    expect(studio).toContain('searchAction="/dashboard/quotations"');
    expect(studio).not.toContain('qs-sidebar-navigation');
    expect(shell).toContain('owner-layout-unified');
  });
  it('keeps Finance tabs in the page but not duplicated in the sidebar',()=>{
    expect(canonical).not.toContain("label:'Salaries'");
    expect(canonical).not.toContain("label:'GST'");
    expect(finance).toContain("tab === 'salaries'");
    expect(finance).toContain("tab === 'gst'");
  });
});
