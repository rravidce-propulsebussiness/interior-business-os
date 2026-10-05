import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { reportKinds } from '@business-os/core/automation';
import { reportPermissions } from './service';
export default async function ReportsPage() {
  await pageServices();
  const context = await activeOrganization();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <Link href="/dashboard" className="underline">
        Dashboard
      </Link>
      <h1 className="text-3xl font-semibold">Reports</h1>
      <p>
        Current canonical business records, filtered by your permissions. Choose
        a report to review its period and calculation basis.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {context &&
          reportKinds
            .filter((kind) =>
              canAccess(context, {
                organizationId: context.organizationId,
                permission: reportPermissions[kind],
              }),
            )
            .map((kind) => (
              <Link
                className="rounded border p-5 capitalize hover:bg-slate-50"
                key={kind}
                href={`/dashboard/reports/${kind}`}
              >
                {kind === 'inventory' ? 'Materials and inventory' : kind}
              </Link>
            ))}
      </div>
    </main>
  );
}
