import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';

export const dynamic = 'force-dynamic';

const phases = [
  {
    number: '01',
    title: 'After closing — technical design',
    subtitle: 'Architectural plan, 3D design & structural drawings',
    actions: [
      'Assign architect and structural designer',
      'Upload revision drawings',
      'Manager approves technical revisions',
    ],
  },
  {
    number: '02',
    title: 'Client approval before execution',
    subtitle: 'Review approved drawings with the client',
    actions: [
      'Record client approval evidence',
      'Keep a record of final revisions',
      'Manager authorizes site mobilization',
    ],
  },
  {
    number: '03',
    title: 'Site preparation & marking',
    subtitle: 'Assigned engineering and site security roles',
    actions: [
      'Marking and gridline / levels checks',
      'Estimate and request materials',
      'Prepare tasks, milestones and site locations',
    ],
  },
  {
    number: '04',
    title: 'Daily execution & procurement',
    subtitle: 'Engineering reports, supplier sourcing and receipts',
    actions: [
      'Today’s work, photos/videos and next-day plan',
      'Site checks and watchman / curing log',
      'Marketplace or outside supplier with actual PO reference',
    ],
  },
  {
    number: '05',
    title: 'Inspection & handover',
    subtitle: 'Formal inspections, issues and physical completion',
    actions: [
      'Resolve pending quality checks',
      'Close material and stock transactions',
      'Validate snags, tasks and final inspection',
    ],
  },
] as const;

const assignments = [
  {
    role: 'Project manager',
    access:
      'Assign staff, review drawings, record approval and release execution',
  },
  {
    role: 'Architect',
    access: 'Submit architectural and 3D revisions; no purchasing access',
  },
  {
    role: 'Structural designer',
    access: 'Submit structural revisions; no project finances',
  },
  {
    role: 'Site engineer',
    access: 'Daily reporting, marking, materials requested and site checks',
  },
  {
    role: 'Watchman / security',
    access: 'Gate deliveries, visitor, labour and curing/security log only',
  },
  {
    role: 'Quality inspector',
    access: 'Inspection evidence and recorded checks',
  },
  { role: 'Procurement', access: 'Material sourcing and purchase references' },
] as const;

export default async function ProjectControl() {
  const { authorization, repository } = await pageServices();
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
    await authorization.requirePlatformPermission('platform.catalog.view');
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const [companies, modules] = await Promise.all([
    repository.organizationDirectory({ page: 1, pageSize: 12 }),
    repository.modules(),
  ]);
  const projectModule = modules.find((m) => m.key === 'projects');
  return (
    <main id="main-content" tabIndex={-1} className="space-y-6">
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-300">
          ProPulse Business OS · Platform control
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Project delivery management
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Configure how construction and interior businesses work from contract
          closure through designs, recorded customer approval, site execution,
          procurement, inspections and handover.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-semibold text-slate-950"
            href="/admin/organizations"
          >
            Configure company access →
          </Link>
          <Link
            className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold"
            href="/admin/control/marketplace"
          >
            Seller marketplace →
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Platform administrators configure companies and entitlements here.
          Tenant records remain private to assigned company staff.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Project module
          </p>
          <strong className="mt-2 block text-xl capitalize">
            {projectModule?.status ?? 'Not configured'}
          </strong>
          <p className="mt-1 text-sm text-slate-600">
            Organization entitlement still required
          </p>
        </article>
        <article className="rounded-2xl border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Registered companies
          </p>
          <strong className="mt-2 block text-3xl">{companies.total}</strong>
          <p className="mt-1 text-sm text-slate-600">
            Separate project records and company roles
          </p>
        </article>
        <article className="rounded-2xl border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Delivery workflow
          </p>
          <strong className="mt-2 block text-xl">5 stages</strong>
          <p className="mt-1 text-sm text-slate-600">
            Design approval gate before execution
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-bold">
          How a construction project progresses
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          The tenant's daily delivery workspace sits alongside the existing
          planning, estimate, purchasing, inventory, quality and handover
          modules.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {phases.map((phase, index) => (
            <article
              key={phase.number}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">
                Stage {phase.number} {index === 1 ? '· approval required' : ''}
              </p>
              <h3 className="mt-2 text-lg font-semibold">{phase.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{phase.subtitle}</p>
              <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-slate-700">
                {phase.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-bold">Company roles and access</h2>
        <p className="mt-2 text-sm text-slate-600">
          Workers must belong to the company and be explicitly assigned to a
          project. Site roles cannot open another company's project or
          unrestricted company finances.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="border-b p-3">Project role</th>
                <th className="border-b p-3">Delivery workspace permissions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.role}>
                  <td className="border-b p-3 font-semibold">{a.role}</td>
                  <td className="border-b p-3 text-slate-700">{a.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-amber-800">
          Client approval is currently recorded by authorized staff with
          evidence; it is not a digitally signed client approval portal. Large
          videos and automatically calculated structural quantities need
          separate integrations.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="text-xl font-bold">Enable and manage per business</h2>
          <Link
            className="text-sm font-semibold text-blue-700 underline"
            href="/admin/organizations"
          >
            View all companies →
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Open the company to configure its Projects subscription entitlement. A
          company manager then opens Projects → individual project → Delivery
          workspace and assigns the architect, engineer, watchman and
          procurement staff.
        </p>
        <div className="mt-4 space-y-2">
          {companies.organizations.map((company) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              key={company.id}
            >
              <div>
                <strong className="text-sm">{company.name}</strong>
                <p className="text-xs capitalize text-slate-500">
                  {company.status}
                </p>
              </div>
              <Link
                className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                href={`/admin/organizations/${company.id}`}
              >
                Configure module →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
