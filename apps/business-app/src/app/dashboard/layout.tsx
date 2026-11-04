import type { ReactNode } from 'react';
import { activeOrganization } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { CompanyNavigationProvider } from './company-navigation-provider';
import { ownerWorkspaceNavigation } from './owner-workspace-navigation';
import './dashboard-shared-theme.css';

export const dynamic = 'force-dynamic';

/**
 * One tenant-scoped navigation provider and one lightweight CSS scope.
 * display:contents preserves existing OwnerShell and page layout behavior.
 * Legacy routes with a direct <main> get premium controls without a second
 * sidebar. Public wildcard websites never enter this dashboard layout.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  let context: Awaited<ReturnType<typeof activeOrganization>> = null;
  try {
    context = await activeOrganization();
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'UNAUTHENTICATED'))
      throw error;
  }
  return (
    <CompanyNavigationProvider navigation={ownerWorkspaceNavigation(context)}>
      <div className="dashboard-visual-root">{children}</div>
    </CompanyNavigationProvider>
  );
}
