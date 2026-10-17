import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canAccess } from '@business-os/auth';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import '../owner-dashboard.css';

export const dynamic = 'force-dynamic';

/**
 * Temporary Projects entry while the previous UI is retired.
 * This is deliberately not a project list or execution screen.
 * Database records, agreements and project-service RPCs are untouched.
 */
export default async function ProjectsResetPage() {
 const { client, user } = await pageServices();
 const context = await activeOrganization();
 if (!context) notFound();
 const org = context.organizationId;
 const permitted = canAccess(context, { organizationId: org, permission: 'project.view', moduleKey: 'projects' });
 if (!permitted && !context.entitlements.includes('projects')) notFound();
 const { data: company } = await client.from('organizations').select('name').eq('id', org).maybeSingle();
 const email = user.email ?? '';
 return <OwnerShell
  companyName={company?.name ?? 'Business OS'}
  accountLabel={email.split('@')[0] || 'Company member'}
  accountEmail={email}
  planLabel="Business workspace"
  navigation={ownerWorkspaceNavigation(context)}
  currentHref="/dashboard/projects"
  search=""
  notificationsEnabled={canAccess(context, { organizationId: org, permission: 'notification.view' })}
  dashboardBrand
 >
  <main id="main-content" className="min-h-[65vh] bg-[#fffaf7] px-4 py-10 text-[#192742] sm:px-8">
   <section className="mx-auto max-w-2xl rounded-2xl border border-[#f0e6de] bg-white px-6 py-12 text-center shadow-sm sm:px-12">
    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0e5] text-2xl text-[#ec681c]">▣</div>
    <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-[#e66d2b]">Projects</p>
    <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Ready for a fresh workspace</h1>
    <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#6a7991]">
     The previous project pages have been retired so a cleaner project experience can be designed from scratch.
     Existing project records, agreements, site activity, financial history and uploaded files have not been deleted.
    </p>
    <Link href="/dashboard" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#fa5c11] px-6 py-3 text-sm font-bold text-white">
     Back to Dashboard
    </Link>
   </section>
  </main>
 </OwnerShell>;
}
