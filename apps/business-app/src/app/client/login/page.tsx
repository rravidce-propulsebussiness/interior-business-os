import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerDatabase, isSupabaseConfigured } from '@business-os/database/server';
import { signIn } from '@business-os/auth/actions';
import { ClientLoginForm } from '../client-login-form';

export const dynamic = 'force-dynamic';

export default async function ClientLoginPage({ searchParams }: {
  searchParams: Promise<{ project?: string }>;
}) {
  // A project ID is only a navigation hint. The database validates the
  // signed-in email's explicit grant before revealing project data.
  const query = await searchParams;
  const projectId = z.uuid().safeParse(query.project).success ? query.project : undefined;
  if (isSupabaseConfigured()) {
    const db = await createServerDatabase();
    const { data } = await db.auth.getUser();
    if (data.user) redirect(projectId ? '/client/projects/' + projectId : '/client');
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-slate-950 p-7 text-white">
          <p className="text-sm font-bold tracking-widest text-blue-300">PRO PULSE · CLIENT APP</p>
          <h1 className="mt-5 text-3xl font-bold">Your project, in your hands.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            See construction and interior design progress, site photos,
            tomorrow's work and drawings shared by your project team.
          </p>
        </div>
        <div className="p-7">
          <h2 className="text-xl font-bold">Client sign in</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use the email your construction or interior company invited.
            Client access is separate from employee accounts.
          </p>
          <ClientLoginForm action={signIn} {...(projectId ? { projectId } : {})} />
          <p className="mt-5 text-center text-sm text-slate-500">
            <Link href="/" className="underline">Business OS home</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
