import type { ReactNode } from 'react';
import { activeOrganization } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { CompanyNavigationProvider } from './company-navigation-provider';
import { ownerWorkspaceNavigation } from './owner-workspace-navigation';

export const dynamic = 'force-dynamic';

/**
 * All company dashboard pages share the same membership-filtered menu.
 * activeOrganization is React request-cached, so pages that also read it
 * reuse that same server request; no secondary navigation RPC.
 */
export default async function DashboardLayout({children}:{children:ReactNode}) {
  let context: Awaited<ReturnType<typeof activeOrganization>> = null;
  try {
    context = await activeOrganization();
  } catch(error) {
    // Let individual pages perform their established sign-in redirect.
    if (!(error instanceof DomainError && error.code === 'UNAUTHENTICATED')) throw error;
  }
  return <CompanyNavigationProvider navigation={ownerWorkspaceNavigation(context)}>
    {children}
  </CompanyNavigationProvider>;
}
