import type { OwnerNavItem } from '../owner-shell';

/** Keep the Projects list and each detail page on the same permission-filtered menu. */
export function projectWorkspaceNavigation(
  has: (permission: string, moduleKey?: string) => boolean,
): OwnerNavItem[] {
  const navigation: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  ];
  if (has('lead.view', 'crm'))
    navigation.push({
      label: 'Leads',
      href: '/dashboard/crm/leads',
      icon: 'leads',
    });
  if (has('quotation.view', 'quotation'))
    navigation.push({
      label: 'Quotations',
      href: '/dashboard/quotations',
      icon: 'quotations',
    });
  navigation.push({
    label: 'Projects',
    href: '/dashboard/projects',
    icon: 'projects',
  });
  if (has('customer.view', 'crm') || has('customer.view', 'quotation'))
    navigation.push({
      label: 'Clients',
      href: '/dashboard/customers',
      icon: 'clients',
    });
  if (has('purchase.view')) {
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
  if (has('invoice.view', 'billing')) {
    navigation.push({
      label: 'Billing & Invoices',
      href: '/dashboard/billing',
      icon: 'billing',
    });
    navigation.push({
      label: 'Expenses',
      href: '/dashboard/billing?kind=purchase_bill',
      icon: 'expenses',
    });
  }
  if (
    has('report.view') ||
    has('report.financial') ||
    has('financial_report.view', 'billing')
  )
    navigation.push({
      label: 'Reports',
      href: '/dashboard/reports',
      icon: 'reports',
    });
  if (has('team.view') || has('role.view'))
    navigation.push({
      label: 'Team',
      href: '/dashboard/company/team',
      icon: 'team',
    });
  if (has('website.view', 'website'))
    navigation.push({
      label: 'Website',
      href: '/dashboard/website',
      icon: 'globe',
    });
  if (has('organization.view'))
    navigation.push({
      label: 'Company Settings',
      href: '/dashboard/company/settings',
      icon: 'settings',
    });

  return navigation;
}
