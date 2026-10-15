import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import { ClientDesignReview } from '../../client-design-review';
import { ClientProjectTimeline } from '../../project-timeline';

export const dynamic = 'force-dynamic';

const schema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  company_name: z.string(),
  stage: z.string(),
  client_approved_at: z.string().nullable().optional(),
  reports: z.array(z.object({
    report_date: z.string(),
    completed_work: z.string(),
    tomorrow_plan: z.string(),
    worker_count: z.number().nullable(),
    tomorrow_workers: z.number().nullable().optional(),
    created_at: z.string(),
  })).default([]),
  drawings: z.array(z.object({
    kind: z.string(),
    revision: z.number(),
    reference: z.string(),
    status: z.string(),
    created_at: z.string(),
  })).default([]),
  photos: z.array(z.object({
    id: z.uuid(),
    filename: z.string(),
    category: z.string(),
    mime: z.string(),
    caption: z.string(),
    created_at: z.string(),
  })).default([]),
});
const timelineSchema = z.array(z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  phase: z.string(),
  floor_code: z.string().nullable(),
  status: z.string(),
  completed_at: z.string().nullable(),
  activities: z.array(z.string()),
}));

const stages = [
  { key: 'design', title: 'Design' },
  { key: 'client_approved', title: 'Approved' },
  { key: 'execution', title: 'Site work' },
  { key: 'handover', title: 'Handover' },
];
function label(value: string) {
  return value.replaceAll('_',' ').replace(/\b\w/g, letter=>letter.toUpperCase());
}
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value :
    parsed.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}

export default async function ClientProject({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect('/client/login?project=' + id);
  const rpc = db.rpc.bind(db) as unknown as (
    name: string, args: Record<string, string>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const [loaded, timelineResponse] = await Promise.all([
    rpc('client_portal_project', { p_project_id: id }),
    rpc('client_portal_timeline', { p_project_id: id }),
  ]);
  const parsed = schema.safeParse(loaded.data);
  if (loaded.error || !parsed.success) notFound();
  const project = parsed.data;
  const timelineParsed = timelineSchema.safeParse(timelineResponse.data);
  const timeline = !timelineResponse.error && timelineParsed.success
    ? timelineParsed.data : [];
  const timelineUnavailable = Boolean(timelineResponse.error || !timelineParsed.success);

  const stageIndex = stages.findIndex(stage=>stage.key===project.stage);
  const latestDesigns = new Map<string,(typeof project.drawings)[number]>();
  for (const item of project.drawings) {
    if (!latestDesigns.has(item.kind)) latestDesigns.set(item.kind,item);
  }
  const currentDesigns = [...latestDesigns.values()];
  const photos = project.photos.filter(photo=>photo.mime.startsWith('image/'));
  const documents = project.photos.filter(photo=>photo.mime==='application/pdf');

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Link className="text-sm font-semibold text-blue-700" href="/client">← My projects</Link>
          <span className="text-xs font-bold tracking-widest text-slate-600">
            CLIENT APP · {project.company_name}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-7 px-5 py-8">
        <section className="rounded-3xl bg-slate-950 p-7 text-white sm:p-9">
          <p className="text-xs font-bold tracking-widest text-blue-300">PROJECT OVERVIEW</p>
          <h1 className="mt-3 text-3xl font-bold">{project.name}</h1>
          <p className="mt-2 text-sm text-slate-300">{project.code} · {project.company_name}</p>
          <div className="mt-7 grid grid-cols-2 gap-2 md:grid-cols-4">
            {stages.map((stage,index)=>(
              <div key={stage.key}
                className={'rounded-xl px-3 py-3 text-sm font-semibold '+(
                  stageIndex >= index ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                )}>
                <span className="mr-2">{stageIndex >= index ? '✓' : index+1}</span>
                {stage.title}
              </div>
            ))}
          </div>
          {project.stage==='not_started' && (
            <p className="mt-5 text-sm text-slate-300">
              Your company is preparing the agreement and initial project plan.
            </p>
          )}
          <a href="#project-timeline"
            className="mt-6 inline-block rounded-xl border border-blue-300 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            View full work timeline ↓
          </a>
        </section>

        <ClientProjectTimeline stages={timeline} unavailable={timelineUnavailable} />

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Site progress</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {project.reports.length} updates
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Work completed, next-day plans and site labour reported by your team.
            </p>
            {project.reports.length ? (
              <div className="mt-6 space-y-5">
                {project.reports.map((report,index)=>(
                  <article className="relative border-l-2 border-blue-200 pl-5"
                    key={report.report_date+'-'+report.created_at+'-'+index}>
                    <span className="absolute -left-2 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600" />
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                      {date(report.report_date)}
                    </p>
                    <h3 className="mt-2 font-semibold">Work completed</h3>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.completed_work}</p>
                    <div className="mt-3 rounded-xl bg-slate-50 p-4">
                      <h4 className="text-sm font-bold">Tomorrow's plan</h4>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {report.tomorrow_plan}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Labour today: {report.worker_count ?? '—'}
                        {' · '}Planned tomorrow: {report.tomorrow_workers ?? '—'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-7 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
                Site reports will appear here after your team begins posting updates.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Designs & drawings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Current drawing revisions and their review status.
            </p>
            <div className="mt-5 space-y-3">
              {currentDesigns.length ? currentDesigns.map(drawing=>(
                <div className="rounded-xl border border-slate-200 p-4" key={drawing.kind}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">{label(drawing.kind)}</strong>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                      {label(drawing.status)}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-slate-500">
                    Revision {drawing.revision} · {drawing.reference}
                  </p>
                </div>
              )) : (
                <p className="text-sm text-slate-600">Drawings have not been submitted yet.</p>
              )}
            </div>
            {project.stage==='design' && currentDesigns.length>0 && (
              <ClientDesignReview projectId={project.id} drawings={currentDesigns} />
            )}
            {project.stage!=='design' && project.client_approved_at && (
              <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                Client design approval recorded on {date(project.client_approved_at)}.
              </p>
            )}
          </section>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Project photos & documents</h2>
          <p className="mt-1 text-sm text-slate-500">
            Site work, curing, progress photos and shared design evidence.
          </p>
          {photos.length ? (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {photos.map(photo=>(
                <a className="overflow-hidden rounded-2xl border border-slate-200"
                  key={photo.id} href={'/client/media/'+photo.id} target="_blank" rel="noreferrer">
                  <img alt={photo.caption || photo.filename}
                    src={'/client/media/'+photo.id}
                    className="h-36 w-full bg-slate-100 object-cover" loading="lazy" />
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold">{photo.caption || label(photo.category)}</p>
                    <p className="mt-1 text-xs text-slate-500">{date(photo.created_at)}</p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Your site engineer's and watchman's photos will appear here when uploaded.
            </p>
          )}
          {documents.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">
              {documents.map(doc=>(
                <a key={doc.id} href={'/client/media/'+doc.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-blue-700">
                  Download {doc.caption || doc.filename} ↗
                </a>
              ))}
            </div>
          )}
        </section>
        <p className="pb-6 text-center text-xs text-slate-500">
          Updates are provided by your project team. Contact your company for urgent site or safety matters.
        </p>
      </div>
    </main>
  );
}
