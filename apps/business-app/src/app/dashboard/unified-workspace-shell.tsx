import type { ReactNode } from 'react';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { OwnerShell } from './owner-shell';
import { ownerWorkspaceNavigation } from './owner-workspace-navigation';

/** Supplies the same company header and permission-filtered navigation to
 * dashboard routes that predate the shared OwnerShell pages. */
export async function UnifiedWorkspaceShell({
  children,
  currentHref,
}: {
  children: ReactNode;
  currentHref: string;
}) {
  const context = await activeOrganization();
  const services = await pageServices();
  const { data: organization } = context
    ? await services.client
        .from('organizations')
        .select('name')
        .eq('id', context.organizationId)
        .single()
    : { data: null };
  const navigation = ownerWorkspaceNavigation(context);
  const email = services.user.email ?? '';

  return (
    <OwnerShell
      companyName={organization?.name || 'Business OS'}
      accountLabel={email.split('@')[0] || 'Company member'}
      accountEmail={email}
      planLabel="Business workspace"
      navigation={navigation}
      currentHref={currentHref}
      search=""
      searchPlaceholder="Search your company workspace..."
      notificationsEnabled={navigation.some(
        (item) => item.href === '/dashboard/work',
      )}
    >
      {children}
    </OwnerShell>
  );
}
