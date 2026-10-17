import type { OwnerNavItem } from '../owner-shell';
import { leadsNavigation } from '../leads-navigation';

/** Keep the Projects list and each detail page on the same permission-filtered menu. */
export function projectWorkspaceNavigation(
  has: (permission: string, moduleKey?: string) => boolean,
): OwnerNavItem[] {
  const navigation: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  ];
  if (has('lead.view', 'crm'))
    navigation.push(
      leadsNavigation({
        canCreate: has('lead.create', 'crm'),
        canManage: has('crm.pipeline.manage'),
      }),
    );
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

  }
  if (has('invoice.view', 'billing')) {
    navigation.push({
      label: 'Finance',
      href: '/dashboard/finance',
      icon: 'billing',
      children: [
        { label: 'Invoices', href: '/dashboard/finance?tab=invoices' },
        { label: 'Expenses', href: '/dashboard/finance?tab=expenses' },
        { label: 'GST', href: '/dashboard/finance?tab=gst' },
        { label: 'Salaries', href: '/dashboard/finance?tab=salaries' },
      ],
    });
    navigation.push({
      label: 'Billing & Plans',
      href: '/dashboard/billing',
      icon: 'billing',
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
  if (has('team.manage'))
    navigation.push({ label: 'Employees', href: '/dashboard/employees', icon: 'team' });
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
