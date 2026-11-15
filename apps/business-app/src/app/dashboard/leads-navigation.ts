import type { OwnerNavItem } from './owner-shell';

/** One Leads workspace. Field configuration lives exclusively in Main Settings. */
export function leadsNavigation(
  _permissions: {
    canCreate?: boolean;
    canManage?: boolean;
  } = {},
): OwnerNavItem {
  return { label: 'Leads', href: '/dashboard/crm/leads', icon: 'leads' };
}
