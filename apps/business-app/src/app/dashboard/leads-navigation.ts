import type { OwnerNavItem } from './owner-shell';

/**
 * Shared company sidebar item for the lead-management workspace.
 * Keep CRM as the internal route/module name, while the customer-facing
 * navigation consistently calls it Leads on every screen.
 */
export function leadsNavigation({
  canManage = false,
}: {
  canCreate?: boolean;
  canManage?: boolean;
} = {}): OwnerNavItem {
  const leadsPath = '/dashboard/crm/leads';
  return {
    label: 'Leads',
    href: leadsPath,
    icon: 'leads',
    children: [
      { label: 'All Leads', href: leadsPath },
      { label: 'Follow-ups', href: '/dashboard/crm/followups' },
      { label: 'Site Visits', href: '/dashboard/crm/site-visits' },
      ...(canManage
        ? [{ label: 'Lead Settings', href: '/dashboard/crm/settings' }]
        : []),
    ],
  };
}
