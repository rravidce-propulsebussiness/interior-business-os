import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { PlansWorkspace } from './plans-workspace';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPlans() {
  const { authorization, repository, client } = await pageServices();
  let permissions: string[];
  try {
    permissions = (
      await authorization.requirePlatformPermission('platform.catalog.view')
    ).permissions;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }

  const [plans, modules, mappings] = await Promise.all([
    repository.plans(),
    repository.modules(),
    repository.planModules(),
  ]);
  const canSeeOrganizations = permissions.includes(
    'platform.organizations.view',
  );

  // Exact counts, without transferring tenant records to the browser. Scoped
  // to organizations the authenticated platform administrator can view.
  const countResults = canSeeOrganizations
    ? await Promise.all(
        plans.map((plan) =>
          client
            .from('organizations')
            .select('id', { count: 'exact', head: true })
            .eq('plan_id', plan.id)
            .neq('status', 'archived'),
        ),
      )
    : [];

  const usageByPlan: Record<string, number | null> = {};
  for (let index = 0; index < plans.length; index += 1) {
    const response = countResults[index];
    usageByPlan[plans[index]!.id] =
      response && !response.error ? response.count : null;
  }

  return (
    <PlansWorkspace
      plans={plans.map((plan) => ({
        id: plan.id,
        key: plan.key,
        name: plan.name,
        status: plan.status,
        moduleIds: mappings
          .filter((mapping) => mapping.plan_id === plan.id)
          .map((mapping) => mapping.module_id),
      }))}
      modules={modules.map((module) => ({
        id: module.id,
        key: module.key,
        name: module.name,
        status: module.status,
      }))}
      usageByPlan={usageByPlan}
      canCreate={permissions.includes('platform.entitlements.manage')}
    />
  );
}
