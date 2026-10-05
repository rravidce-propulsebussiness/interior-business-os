import type { ReactNode } from 'react';
import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { createAutomationRepository } from '@business-os/database/automation';
import { NotificationControls } from './notifications/panels';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = await pageServices(),
    context = await activeOrganization();
  const notifications =
    context &&
    canAccess(context, {
      organizationId: context.organizationId,
      permission: 'notification.view',
    })
      ? await createAutomationRepository(
          s.client,
          context.organizationId,
        ).notifications(1, 'unread')
      : null;
  return (
    <>
      {notifications && (
        <header className="border-b px-6 py-3">
          <details className="mx-auto max-w-6xl">
            <summary className="cursor-pointer text-right">
              <span aria-hidden="true">🔔 </span>Notifications (
              {notifications.unread ?? 0} unread)
            </summary>
            <div className="ml-auto mt-3 max-w-lg space-y-3 rounded border bg-white p-4">
              {notifications.rows.slice(0, 5).map((row) => (
                <div className="space-y-2 border-b pb-3" key={String(row.id)}>
                  <Link
                    className="underline"
                    href={`/dashboard/notifications/${row.id}`}
                  >
                    {String(row.title)}
                  </Link>
                  <NotificationControls
                    id={String(row.id)}
                    version={Number(row.version)}
                    status={String(row.status)}
                  />
                </div>
              ))}
              {notifications.rows.length === 0 && (
                <p>No unread notifications.</p>
              )}
              <Link className="block underline" href="/dashboard/notifications">
                View all notifications
              </Link>
            </div>
          </details>
        </header>
      )}
      {children}
    </>
  );
}
