import type { ReactNode } from 'react';
import { UnifiedWorkspaceShell } from '../../unified-workspace-shell';

export default function ReportOverviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <UnifiedWorkspaceShell currentHref="/dashboard/reports">
      {children}
    </UnifiedWorkspaceShell>
  );
}
