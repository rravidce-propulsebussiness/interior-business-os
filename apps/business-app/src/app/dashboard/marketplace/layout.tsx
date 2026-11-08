import type { ReactNode } from 'react';
import { UnifiedWorkspaceShell } from '../unified-workspace-shell';

export default function MarketplaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <UnifiedWorkspaceShell currentHref="/dashboard/marketplace">
      {children}
    </UnifiedWorkspaceShell>
  );
}
