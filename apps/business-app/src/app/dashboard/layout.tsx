import type { ReactNode } from 'react';

// The Owner dashboard renders its own notification access. Do not make
// every protected dashboard route depend on an additional notification RPC
// before the RSC stream can finish. Notifications remain available from
// /dashboard/notifications.
export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
