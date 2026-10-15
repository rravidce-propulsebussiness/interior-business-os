import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerDatabase } from '@business-os/database/server';
import { signOut } from '@business-os/auth/actions';

export const dynamic = 'force-dynamic';

const projectsSchema = z.array(z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  company_name: z.string(),
  stage: z.string(),
}));
const display = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

export default async function ClientHome() {
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect('/client/login');
  const rpc = db.rpc.bind(db) as unknown as (
    name: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const result = await rpc('client_portal_projects');
  const parsed = projectsSchema.safeParse(result.data);
  const projects = !result.error && parsed.success ? parsed.data : [];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-700">PRO PULSE · CLIENT APP</p>
            <h1 className="mt-1 text-2xl font-bold">My projects</h1>
          </div>
          <form action={signOut}>
            <button type="submit" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8">
        <p className="text-sm text-slate-600">
          Signed in as <strong>{auth.user.email}</strong>. Only projects shared with your
          verified email address appear here.
        </p>
        {result.error && (
          <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            We could not load client access. Please confirm your email and try again.
          </p>
        )}
        {projects.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {projects.map(project => (
              <Link href={'/client/projects/' + project.id} key={project.id}
                className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{project.company_name}</p>
                <h2 className="mt-4 text-xl font-bold">{project.name}</h2>
                <p className="mt-2 text-sm text-slate-500">{project.code}</p>
                <div className="mt-6 flex items-center justify-between">
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
                    {display(project.stage)}
                  </span>
                  <span className="font-semibold text-blue-700 group-hover:underline">View updates →</span>
                </div>
              </Link>
            ))}
          </div>
        ) : !result.error && (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-9 text-center">
            <h2 className="text-xl font-bold">No projects shared yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Ask your builder or interior company to open your customer profile,
              choose the project, and grant access to <strong>{auth.user.email}</strong>.
              You will not need a second account.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
