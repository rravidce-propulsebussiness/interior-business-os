import Link from 'next/link';
import { brochureServices } from '../../service';
import { brochureResult, jsonObject } from '@business-os/database/brochure';
export default async function Analytics({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await brochureServices('brochure.analytics.view', true);
  const b = await s.brochure.read(id);
  const r = brochureResult(
    await s.client.rpc('brochure_metrics_read', {
      p_organization_id: s.context.organizationId,
      p_brochure_id: id,
    }),
  );
  const rows = Array.isArray(r) ? r.map(jsonObject) : [];
  return (
    <main id="main-content" className="mx-auto max-w-4xl space-y-5 px-5 py-8">
      <Link className="underline" href={`/dashboard/brochures/${id}`}>
        ← {b.name}
      </Link>
      <h1 className="text-3xl font-semibold">Brochure activity</h1>
      <p>
        Last 30 days. Aggregate requests include repeat visits and bots; they
        are not unique people.
      </p>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>Date</th>
            <th>Activity</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{String(r.day)}</td>
              <td>{String(r.kind)}</td>
              <td>{String(r.hits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>No activity recorded.</p>}
    </main>
  );
}
