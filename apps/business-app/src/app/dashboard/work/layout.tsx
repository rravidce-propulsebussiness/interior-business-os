import type { ReactNode } from 'react';
import { UnifiedWorkspaceShell } from '../unified-workspace-shell';

export default function WorkLayout({ children }: { children: ReactNode }) {
  return (
    <UnifiedWorkspaceShell currentHref="/dashboard/work">
      {children}
    </UnifiedWorkspaceShell>
  );
}
