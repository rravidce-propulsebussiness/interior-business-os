// The Quotation Studio uses the same company shell and authorized module
// navigation as every other dashboard route. The studio controls and editor
// remain inside their existing qs-main workspace.
'use client';

import { usePathname } from 'next/navigation';
import { OwnerShell } from '../owner-shell';
import './studio.css';

export function QuotationStudioFrame({
  companyName,
  accountEmail,
  children,
}: {
  companyName: string;
  companyLogo?: string | undefined;
  accountEmail?: string | undefined;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <OwnerShell
      companyName={companyName}
      accountLabel={(accountEmail ?? 'Account').split('@')[0] || 'Account'}
      accountEmail={accountEmail ?? ''}
      planLabel="Business workspace"
      navigation={[]}
      search=""
      currentHref={pathname.startsWith('/dashboard/quotations') ? '/dashboard/quotations' : pathname}
      dashboardBrand
      notificationsEnabled={false}
      searchAction="/dashboard/quotations"
      searchPlaceholder="Search quotations..."
    >
      <div className="qs-layout qs-unified-workspace">
        <main className="qs-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </OwnerShell>
  );
}
