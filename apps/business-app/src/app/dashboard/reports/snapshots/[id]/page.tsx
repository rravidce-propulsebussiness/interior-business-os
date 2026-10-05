import Link from 'next/link';
import { reportingServices } from '../../service';
import { ReportTable } from '../../table';
export default async function SnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    s = await reportingServices('snapshot', true),
    snapshot = await s.reports.snapshot(id);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-7xl space-y-5 p-6"
    >
      <Link className="underline" href={`/dashboard/reports/${snapshot.kind}`}>
        Back to report
      </Link>
      <h1 className="text-2xl font-semibold capitalize">
        Saved {snapshot.kind} report
      </h1>
      <p>Generated {snapshot.created_at}</p>
      <p>{snapshot.data.basis}</p>
      <nav className="flex gap-6">
        <a
          className="underline"
          href={`/dashboard/reports/snapshots/${id}/download?format=csv`}
        >
          Download CSV
        </a>
        <a
          className="underline"
          href={`/dashboard/reports/snapshots/${id}/download?format=pdf`}
        >
          Download PDF
        </a>
      </nav>
      {snapshot.data.summary && <ReportTable rows={snapshot.data.summary} />}
      {snapshot.data.aging && snapshot.data.aging.length > 0 && (
        <ReportTable rows={snapshot.data.aging} />
      )}
      <ReportTable rows={snapshot.data.rows} />
      {snapshot.data.dimensions && (
        <ReportTable rows={snapshot.data.dimensions} />
      )}
    </main>
  );
}
