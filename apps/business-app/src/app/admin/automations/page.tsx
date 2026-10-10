import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
export default async function AutomationHealthPage() {
  const s = await pageServices();
  await s.authorization.requirePlatformPermission('platform.audit.view');
  const { data, error } = await s.client.rpc('automation_platform_health');
  if (error || !data || typeof data !== 'object' || Array.isArray(data))
    throw new DomainError('FORBIDDEN');
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-5 p-6"
    >
      <Link className="underline" href="/admin">
        Platform dashboard
      </Link>
      <h1 className="text-3xl font-semibold">Automation worker health</h1>
      <p>
        Operational counts and heartbeat information. Tenant record content is
        excluded.
      </p>
      <dl className="grid gap-4 sm:grid-cols-3">
        {Object.entries(data)
          .filter(([key]) => key !== 'workers')
          .map(([key, value]) => (
            <div className="rounded border p-4" key={key}>
              <dt className="capitalize">{key.replaceAll('_', ' ')}</dt>
              <dd className="text-2xl font-semibold">{String(value)}</dd>
            </div>
          ))}
      </dl>
      <h2 className="text-xl font-semibold">Worker heartbeats</h2>
      <pre className="overflow-auto rounded border p-4">
        {JSON.stringify(data.workers, null, 2)}
      </pre>
    </main>
  );
}
