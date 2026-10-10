import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { signOut } from '@business-os/auth/actions';
import { DomainError } from '@business-os/shared';
import { Button } from '@business-os/ui';
export default async function PlatformDashboard() {
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
  const [organizations, modules, plans, mappings] = await Promise.all([
    repository.organizations(),
    repository.modules(),
    repository.plans(),
    repository.planModules(),
  ]);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-5xl px-6 py-12"
    >
      <h1 className="text-3xl font-semibold">Platform dashboard</h1>
      <p>Platform authorization verified.</p>
      <Link href="/dashboard/automations" className="mr-4 underline">
        Automation health
      </Link>
      <Link href="/dashboard/applications" className="mr-4 underline">
        Review company applications
      </Link>
      <Link href="/dashboard/website" className="underline">
        Website platform controls
      </Link>
      <Link href="/dashboard/brochures" className="ml-4 underline">
        Brochure platform controls
      </Link>
      <form action={signOut} className="my-4">
        <Button>Sign out</Button>
      </form>
      <section className="my-8">
        <h2 className="text-xl font-semibold">
          <Link href="/dashboard/organizations" className="underline">
            Organizations — search and manage
          </Link>
        </h2>
        {organizations.length ? (
          <ul>
            {organizations.map((org) => (
              <li key={org.id}>
                <Link
                  className="underline"
                  href={`/dashboard/organizations/${org.id}`}
                >
                  {org.name}
                </Link>{' '}
                — {org.status}
              </li>
            ))}
          </ul>
        ) : (
          <p>No organizations yet.</p>
        )}
      </section>
      <section className="my-8">
        <h2 className="text-xl font-semibold">Modules</h2>
        <ul>
          {modules.map((module) => (
            <li key={module.id}>
              {module.name} ({module.key}) — {module.status}
            </li>
          ))}
        </ul>
      </section>
      <section className="my-8">
        <h2 className="text-xl font-semibold">Plans and modules</h2>
        {plans.length ? (
          plans.map((plan) => (
            <div className="my-4" key={plan.id}>
              <h3 className="font-semibold">
                {plan.name} — {plan.status}
              </h3>
              <p>
                {modules
                  .filter((module) =>
                    mappings.some(
                      (mapping) =>
                        mapping.plan_id === plan.id &&
                        mapping.module_id === module.id,
                    ),
                  )
                  .map((module) => module.name)
                  .join(', ') || 'No modules assigned.'}
              </p>
            </div>
          ))
        ) : (
          <p>No plans configured.</p>
        )}
      </section>
    </main>
  );
}
