import Link from 'next/link';
import { operationsServices } from '../service';
import { text } from '../../execution/presentation';
export default async function Timeline({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; page?: string }>;
}) {
  const { project, page } = await searchParams,
    s = await operationsServices('execution.view', true);
  if (!project) return <p>Select a project first.</p>;
  const report = await s.operations.timeline(project, Number(page) || 1);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Project timeline</h1>
      <ol className="space-y-3">
        {report.rows.map((row) => (
          <li className="rounded border p-3 text-sm" key={text(row.id)}>
            <time className="text-xs text-muted-foreground">
              {text(row.created_at)}
            </time>
            <p className="font-medium">
              {text(row.action).replaceAll('_', ' ')}
            </p>
            {row.note ? (
              <p className="whitespace-pre-wrap">{text(row.note)}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {text(row.entity_type).replaceAll('_', ' ')} · Actor{' '}
              {text(row.actor_user_id)}
            </p>
          </li>
        ))}
      </ol>
      <nav className="flex gap-4 text-sm">
        {report.page > 1 && (
          <Link href={`?project=${project}&page=${report.page - 1}`}>
            Previous
          </Link>
        )}
        <span>{report.total} visible events</span>
        {report.page * 25 < report.total && (
          <Link href={`?project=${project}&page=${report.page + 1}`}>Next</Link>
        )}
      </nav>
    </section>
  );
}
