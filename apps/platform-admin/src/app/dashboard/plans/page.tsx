import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { createSubscriptionPlan } from './actions';

export default async function SubscriptionPlans() {
  const { authorization, repository } = await pageServices();
  let permissions: string[];
  try {
    permissions = (await authorization.requirePlatformPermission('platform.catalog.view')).permissions;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const [plans, modules, mappings] = await Promise.all([
    repository.plans(), repository.modules(), repository.planModules(),
  ]);
  const editable = permissions.includes('platform.entitlements.manage');
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:underline">← Platform dashboard</Link>
        <header className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
          <p className="text-xs font-semibold tracking-[0.2em] text-sky-300 uppercase">Platform configuration</p>
          <h1 className="mt-3 text-3xl font-semibold">Subscription plans</h1>
          <p className="mt-3 text-sm text-slate-300">
            Configure module bundles using the shared business applications.
            Creating a new plan never changes existing subscriptions.
          </p>
        </header>
        <section aria-label="Existing subscription plans" className="grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize">{plan.status}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{plan.key}</p>
              <p className="mt-4 text-sm leading-6">
                {modules.filter((module) => mappings.some((mapping) =>
                  mapping.plan_id === plan.id && mapping.module_id === module.id
                )).map((module) => module.name).join(', ') || 'No modules assigned'}
              </p>
            </article>
          ))}
        </section>
        {editable && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Create a subscription plan</h2>
            <p className="mt-2 text-sm text-slate-600">
              Select active modules. Existing organizations retain their current plan and data.
            </p>
            <ActionForm action={createSubscriptionPlan} label="Create plan">
              <label className="grid gap-2 text-sm font-medium">
                Plan identifier
                <input name="key" required pattern="[a-z][a-z0-9_]*" minLength={3} maxLength={60}
                  placeholder="construction_plus" className="rounded-lg border border-slate-300 px-4 py-3" />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Plan display name
                <input name="name" required minLength={3} maxLength={100}
                  placeholder="Construction Plus" className="rounded-lg border border-slate-300 px-4 py-3" />
              </label>
              <fieldset className="rounded-xl border border-slate-200 p-4">
                <legend className="px-2 text-sm font-semibold">Included modules</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {modules.filter((module) => module.status === 'active').map((module) => (
                    <label key={module.id} className="flex items-center gap-3 text-sm">
                      <input type="checkbox" name="modules" value={module.key} className="h-4 w-4" />
                      {module.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </section>
        )}
      </div>
    </main>
  );
}
