import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerDatabase } from '@business-os/database/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const uuid = z.uuid();
const projectSchema = z.object({
  project: z.object({
    name: z.string(),
    code: z.string(),
    company: z.string(),
  }),
  stages: z.array(z.object({
    title: z.string(),
    floor: z.string().nullable(),
    phase: z.string(),
    certified: z.boolean(),
  })),
  updates: z.array(z.object({
    date: z.string(),
    completed: z.string(),
    tomorrow: z.string(),
  })),
  as_of: z.string(),
});

export default async function ClientProject({
  params,searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { projectId } = await params;
  const { org } = await searchParams;
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(org).success)
    notFound();
  const client = await createServerDatabase();
  const { data: identity } = await client.auth.getUser();
  if (!identity.user) redirect('/login');
  const { data, error } = await client.rpc('construction_client_project_view', {
    p_org: org!,
    p_project: projectId,
  });
  const projection = !error ? projectSchema.safeParse(data) : null;
  if (!projection?.success) notFound();
  const { project, stages, updates, as_of } = projection.data;
  return (
    <main id="main-content" className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-7">
      <div className="mx-auto max-w-6xl">
        <Link href="/client/projects" className="text-sm font-semibold text-blue-700">
          ← My projects
        </Link>
        <header className="mt-5 rounded-3xl bg-slate-950 p-7 text-white sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">
            {project.company} · Client project
          </p>
          <h1 className="mt-3 text-3xl font-bold">{project.name}</h1>
          <p className="mt-2 text-sm text-slate-300">Project {project.code}</p>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Stage clearance remains valid only while required engineering,
            curing, contract and inspection checks are satisfied.
          </p>
        </header>
        <section className="mt-7" aria-labelledby="stage-title">
          <h2 id="stage-title" className="text-xl font-bold">Construction stages</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stages.map((stage, index) => (
              <article key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {stage.floor ?? 'Project-wide'} · {stage.phase.replaceAll('_', ' ')}
                </p>
                <h3 className="mt-2 font-bold">{stage.title}</h3>
                <span className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                  stage.certified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                }`}>
                  {stage.certified ? 'Quality cleared' : 'In progress / awaiting checks'}
                </span>
              </article>
            ))}
            {stages.length === 0 && (
              <p className="text-sm text-slate-600">No construction stages have been published yet.</p>
            )}
          </div>
        </section>
        <section className="mt-8" aria-labelledby="updates-title">
          <h2 id="updates-title" className="text-xl font-bold">Approved daily updates</h2>
          <div className="mt-4 space-y-3">
            {updates.map((update,index) => (
              <article key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">{update.date}</p>
                <h3 className="mt-3 text-xs font-bold uppercase text-slate-500">Completed work</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">{update.completed}</p>
                <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Tomorrow's work</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">{update.tomorrow}</p>
              </article>
            ))}
            {updates.length === 0 && (
              <p className="rounded-xl bg-white p-5 text-sm text-slate-600">
                Your manager has not published any daily reports yet.
              </p>
            )}
          </div>
        </section>
        <footer className="my-8 text-xs text-slate-500">
          Last checked: {as_of}. This page does not certify payments, constitute
          an agreement signature or show unpublished engineering records.
        </footer>
      </div>
    </main>
  );
}
