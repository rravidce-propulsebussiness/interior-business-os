import Link from 'next/link';
import type { ReactNode } from 'react';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import './execution-premium.css';
import './boq-stage-builder.css';
import './boq-labour.css';
import './boq-register-landing.css';
import './boq-final-floor-pricing.css';
import './boq-create-step.css';
import './boq-structural-concrete-card.css';
import './boq-wizard-flow.css';
import './boq-compact-fixes.css';

/**
 * Execution pages used to render without the shared business shell.
 * Each child route still performs its existing permission checks; this
 * layout only supplies the unified, branded company navigation.
 */
export default async function ExecutionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await activeOrganization();
  if (!context) return <>{children}</>;
  const s = await pageServices();
  const { data: org } = await s.client
    .from('organizations')
    .select('name')
    .eq('id', context.organizationId)
    .single();
  const email = s.user.email ?? '';

  return (
    <OwnerShell
      companyName={org?.name || 'Business OS'}
      accountLabel={email.split('@')[0] || 'Company member'}
      accountEmail={email}
      planLabel="Business workspace"
      navigation={ownerWorkspaceNavigation(context)}
      search=""
      searchPlaceholder="Search your company workspace..."
      currentHref="/dashboard/execution/boq"
      notificationsEnabled={ownerWorkspaceNavigation(context).some(
        (item) => item.href === '/dashboard/work',
      )}
    >
      <div className="execution-workspace">
        <nav
          aria-label="Construction workspace navigation"
          className="erp-crumbs"
        >
          <Link href="/dashboard">Business OS</Link>
          <span aria-hidden="true">/</span>
          <Link href="/dashboard/execution">Construction ERP</Link>
          <span aria-hidden="true">/</span>
          <Link href="/dashboard/execution/boq">BOQ &amp; Estimating</Link>
        </nav>
        {children}
      </div>
    </OwnerShell>
  );
}
