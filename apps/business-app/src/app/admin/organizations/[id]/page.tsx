import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError, idSchema } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { changeEntitlement, changeOrganization } from '../../actions';
export default async function OrganizationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { authorization, repository } = await pageServices();
  if (!idSchema.safeParse(id).success) notFound();
  let permissions: string[];
  try {
    permissions = (
      await authorization.requirePlatformPermission(
        'platform.organizations.view',
      )
    ).permissions;
    await authorization.requirePlatformPermission('platform.entitlements.view');
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  let organization;
  try {
    organization = await repository.organization(id);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const [modules, entitlements, plans, mappings] = await Promise.all([
    repository.modules(),
    repository.entitlements(id),
    repository.plans(),
    repository.planModules(),
  ]);
  const plan = plans.find((item) => item.id === organization.plan_id);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-5xl px-6 py-12"
    >
      <h1 className="text-3xl font-semibold">{organization.name}</h1>
      <p>
        {organization.slug} — {organization.status}
      </p>
      <p>
        {organization.country_code} · {organization.default_currency} ·{' '}
        {organization.default_timezone}
      </p>
      <section className="my-8">
        <h2 className="text-xl font-semibold">Plan configuration</h2>
        <p>{plan?.name ?? 'No plan assigned.'}</p>
        <p>
          {modules
            .filter((m) =>
              mappings.some(
                (pm) =>
                  pm.plan_id === organization.plan_id && pm.module_id === m.id,
              ),
            )
            .map((m) => m.name)
            .join(', ')}
        </p>
      </section>
      <section className="my-8">
        <h2 className="text-xl font-semibold">Entitlement overrides</h2>
        {entitlements.length ? (
          <ul>
            {entitlements.map((item) => (
              <li key={item.id}>
                {modules.find((module) => module.id === item.module_id)?.name} —{' '}
                {item.enabled ? 'enabled' : 'disabled'} ({item.source}),{' '}
                {item.valid_from} to {item.valid_until ?? 'no end date'}
              </li>
            ))}
          </ul>
        ) : (
          <p>No explicit overrides.</p>
        )}
      </section>
      {permissions.includes('platform.entitlements.manage') && (
        <section>
          <h2 className="text-xl font-semibold">Set manual entitlement</h2>
          <ActionForm action={changeEntitlement} label="Save entitlement">
            <input type="hidden" name="organizationId" value={id} />
            <label>
              Module
              <select name="moduleKey" className="ml-3 rounded border p-2">
                {modules.map((module) => (
                  <option key={module.id} value={module.key}>
                    {module.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Access
              <select name="enabled" className="ml-3 rounded border p-2">
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
          </ActionForm>
        </section>
      )}
      {permissions.includes('platform.organizations.manage') && (
        <section>
          <h2 className="text-xl font-semibold">
            Organization status and plan
          </h2>
          <ActionForm action={changeOrganization} label="Save organization">
            <input type="hidden" name="organizationId" value={id} />
            <label>
              Status
              <select
                name="status"
                defaultValue={organization.status}
                className="ml-3 rounded border p-2"
              >
                {['active', 'trial', 'suspended', 'archived'].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Plan
              <select
                name="planId"
                defaultValue={organization.plan_id ?? ''}
                className="ml-3 rounded border p-2"
              >
                <option value="">No plan</option>
                {plans
                  .filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </ActionForm>
        </section>
      )}
    </main>
  );
}
