import Link from 'next/link';
import { automationServices } from '../automations/service';
import { NotificationControls } from './panels';
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const query = await searchParams,
    s = await automationServices('notification.view', true);
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(query.page)) || 1),
  );
  const status =
    query.status === 'unread' ||
    query.status === 'read' ||
    query.status === 'archived'
      ? query.status
      : undefined;
  const data = await s.automation.notifications(page, status);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-5 p-6"
    >
      <nav className="flex gap-5">
        <Link href="/dashboard" className="underline">
          Dashboard
        </Link>
        <Link href="/dashboard/notifications/preferences" className="underline">
          Preferences
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <form className="flex gap-3">
        <label>
          Status{' '}
          <select
            name="status"
            defaultValue={status ?? ''}
            className="rounded border p-2"
          >
            <option value="">Active</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button className="rounded border px-3">Filter</button>
      </form>
      <p>{data.total} matching notifications</p>
      {data.rows.length === 0 && (
        <p className="rounded border p-6">No notifications match this view.</p>
      )}
      <ol className="space-y-3">
        {data.rows.map((row) => (
          <li key={String(row.id)} className="space-y-3 rounded border p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <Link
                className="font-semibold underline"
                href={`/dashboard/notifications/${row.id}`}
              >
                {String(row.title)}
              </Link>
              <span className="text-sm">
                {String(row.priority)} · {String(row.status)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {String(row.category)} · {String(row.created_at)}
            </p>
            <NotificationControls
              id={String(row.id)}
              version={Number(row.version)}
              status={String(row.status)}
            />
          </li>
        ))}
      </ol>
      <nav className="flex gap-5" aria-label="Notification pages">
        {page > 1 && (
          <Link href={`?page=${page - 1}&status=${status ?? ''}`}>
            Previous
          </Link>
        )}
        {page * 25 < data.total && (
          <Link href={`?page=${page + 1}&status=${status ?? ''}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
