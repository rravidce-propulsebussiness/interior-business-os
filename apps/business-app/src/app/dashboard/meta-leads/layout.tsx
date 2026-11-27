import type { ReactNode } from 'react';
import { UnifiedWorkspaceShell } from '../unified-workspace-shell';

export default function MetaLeadsLayout({ children }: { children: ReactNode }) {
  return (
    <UnifiedWorkspaceShell currentHref="/dashboard/meta-leads">
      {children}
    </UnifiedWorkspaceShell>
  );
}
