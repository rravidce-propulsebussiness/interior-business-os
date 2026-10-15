import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';

export const dynamic = 'force-dynamic';

const projectsSchema = z.object({
  projects: z.array(z.object({
    organization_id: z.uuid(),
    project_id: z.uuid(),
    name: z.string(),
    code: z.string(),
    company: z.string(),
  })),
});

export default async function ClientProjects() {
  const client = await createServerDatabase();
  const { data: user } = await client.auth.getUser();
  if (!user.user) redirect('/login');
  const { data, error } = await client.rpc('construction_client_projects');
  const parsed = !error ? projectsSchema.safeParse(data) : null;
  const projects = parsed?.success ? parsed.data.projects : [];
  return (
    <main id="main-content" className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-7">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl bg-slate-950 p-7 text-white sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">
            Secure construction updates
          </p>
          <h1 className="mt-3 text-3xl font-bold">My projects</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            View site progress explicitly approved for your verified client account.
            This access is limited to projects assigned to you by their company.
          </p>
        </div>
        {!parsed?.success ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-6 text-sm text-slate-700" role="status">
            The private project portal is not available for this account yet.
            Contact your project manager if you need access.
          </section>
        ) : projects.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            No projects have been assigned to this account yet. Your construction
            company can grant access after confirming your registered email matches
            your customer record.
          </section>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <Link
                href={`/client/projects/${project.project_id}?org=${project.organization_id}`}
                key={project.organization_id + project.project_id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  {project.company}
                </p>
                <h2 className="mt-2 text-lg font-bold">{project.name}</h2>
                <p className="mt-2 text-xs text-slate-500">Project {project.code}</p>
                <p className="mt-4 text-sm font-semibold text-blue-700">
                  View approved site updates →
                </p>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-7 text-xs text-slate-500">
          Unpublished site records, staff details, procurement costs and security
          logs are never included.
        </p>
      </div>
    </main>
  );
}
