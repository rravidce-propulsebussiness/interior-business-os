import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { activeOrganization, pageServices } from '@business-os/auth/server';

export const dynamic = 'force-dynamic';

const projectSchema = z.array(z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  stage: z.string(),
  role: z.string(),
  created_at: z.string(),
}));

export default async function AssignedSiteProjects() {
  const s = await pageServices();
  const organization = await activeOrganization();
  if (!organization) notFound();
  const { data, error } = await s.client.rpc('project_site_my_projects', {
    p_organization_id: organization.organizationId,
  });
  if (error) notFound();
  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) notFound();
  const projects = parsed.data;
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-5 sm:p-8">
      <nav className="mb-4 text-sm text-slate-600">
        <Link className="underline" href="/dashboard">Dashboard</Link> / Assigned sites
      </nav>
      <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-300">Construction & interiors</p>
        <h1 className="mt-2 text-3xl font-bold">My assigned projects</h1>
        <p className="mt-2 text-sm text-slate-300">
          Open the projects you have been assigned to manage, design, supervise or inspect.
          Other businesses and unassigned sites are not displayed.
        </p>
      </header>
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {projects.map(project => (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={project.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">{project.code}</p>
                <h2 className="mt-2 text-xl font-semibold">{project.name}</h2>
              </div>
              <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize">{project.role.replaceAll('_',' ')}</span>
            </div>
            <p className="mt-3 text-sm capitalize text-slate-600">Current stage: {project.stage.replaceAll('_',' ')}</p>
            <Link className="mt-4 inline-block rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              href={`/dashboard/projects/${project.id}/site`}>
              Open project delivery →
            </Link>
          </article>
        ))}
      </section>
      {projects.length===0 && (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No assigned project is available. A company owner or project manager can assign
          your project role from the site delivery workspace.
        </p>
      )}
    </main>
  );
}
