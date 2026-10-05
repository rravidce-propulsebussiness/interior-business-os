import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { BrochurePlatformControls } from './controls';
export default async function BrochurePlatform({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const s = await pageServices();
  await s.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  await s.authorization.requirePlatformPermission('platform.catalog.view');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [plans, limits, brochures] = await Promise.all([
    s.repository.plans(),
    s.client.from('brochure_plan_limits').select('plan_id,configuration'),
    s.client.rpc('brochure_platform', { p_action: 'list', p_page: page }),
  ]);
  if (limits.error || brochures.error)
    throw new Error('Brochure configuration unavailable');
  const rows = Array.isArray(brochures.data)
    ? brochures.data.flatMap((b) =>
        b && typeof b === 'object' && !Array.isArray(b)
          ? [
              {
                id: String(b.id),
                name: String(b.name),
                organization: String(b.organization),
                status: String(b.status),
              },
            ]
          : [],
      )
    : [];
  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <Link href="/dashboard" className="underline">
        ← Platform dashboard
      </Link>
      <h1 className="text-3xl font-semibold">Brochure capabilities</h1>
      <BrochurePlatformControls
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          configuration:
            limits.data.find((l) => l.plan_id === p.id)?.configuration ?? {},
        }))}
        brochures={rows}
      />
      <nav className="flex gap-4 underline">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        {rows.length === 25 && <Link href={`?page=${page + 1}`}>Next</Link>}
      </nav>
    </main>
  );
}
