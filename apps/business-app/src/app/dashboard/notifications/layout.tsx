import type { ReactNode } from 'react';
import { UnifiedWorkspaceShell } from '../unified-workspace-shell';

export default function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <UnifiedWorkspaceShell currentHref="/dashboard/notifications">
      {children}
    </UnifiedWorkspaceShell>
  );
}
