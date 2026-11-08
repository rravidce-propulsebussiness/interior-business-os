import type { ReactNode } from 'react';
import { UnifiedWorkspaceShell } from '../unified-workspace-shell';

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <UnifiedWorkspaceShell currentHref="/dashboard/quotations">
      {children}
    </UnifiedWorkspaceShell>
  );
}
