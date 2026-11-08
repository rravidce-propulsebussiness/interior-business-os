import type { ReactNode } from 'react';
import { UnifiedWorkspaceShell } from '../../unified-workspace-shell';

export default function GstReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <UnifiedWorkspaceShell currentHref="/dashboard/billing">
      {children}
    </UnifiedWorkspaceShell>
  );
}
