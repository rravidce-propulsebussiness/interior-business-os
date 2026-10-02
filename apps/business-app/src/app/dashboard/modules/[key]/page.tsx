import { notFound, redirect } from 'next/navigation';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { StatusPage } from '@business-os/ui';
export default async function ModuleStatus({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { authorization, repository } = await pageServices();
  let title: string;
  try {
    const context = await activeOrganization();
    if (!context) notFound();
    const definition = (await repository.modules()).find(
      (item) => item.key === key && item.status === 'active',
    );
    if (!definition) notFound();
    await authorization.requirePermission(
      context.organizationId,
      definition.required_permission,
      { moduleKey: definition.key },
    );
    await authorization.requireEntitlement(
      context.organizationId,
      definition.key,
    );
    title = definition.name;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  if (key === 'website') redirect('/dashboard/website');
  if (key === 'crm') redirect('/dashboard/crm');
  if (key === 'catalog') redirect('/dashboard/catalog');
  if (key === 'pricing') redirect('/dashboard/pricing');
  if (key === 'quotation') redirect('/dashboard/quotations');
  if (key === 'projects') redirect('/dashboard/projects');
  return (
    <StatusPage
      title={title}
      message="Module access is enabled for your account. This module's business features are scheduled for a later phase."
    />
  );
}
