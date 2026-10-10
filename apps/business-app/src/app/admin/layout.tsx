import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { DashboardShell } from './dashboard-shell';
import './dashboard.css';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { authorization } = await pageServices();
  try {
    await authorization.requirePlatformPermission('platform.access');
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  return <DashboardShell>{children}</DashboardShell>;
}
