import type { ReactNode } from 'react';
import { DashboardShell } from './dashboard-shell';
import './dashboard.css';
import './owner-theme.css';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
