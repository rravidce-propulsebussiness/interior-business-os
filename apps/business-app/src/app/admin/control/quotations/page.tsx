import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import {
  MasterPackageStudio,
  type MasterPackage,
  type IndustryOption,
} from './master-packages';
import './master-packages.css';

export const dynamic = 'force-dynamic';

export default async function AdminQuotationGovernance() {
  const { authorization, client, repository } = await pageServices();
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

  let canManage = false;
  try {
    await authorization.requirePlatformPermission(
      'platform.entitlements.manage',
    );
    canManage = true;
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'FORBIDDEN'))
      throw error;
  }

  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const [templateResult, industryRows] = await Promise.all([
    rpc('platform_master_quotation_list', {}),
    repository.industries(),
  ]);
  const packages: MasterPackage[] =
    !templateResult.error && Array.isArray(templateResult.data)
      ? (templateResult.data as MasterPackage[])
      : [];
  const industries: IndustryOption[] = industryRows
    .filter((industry) => industry.status === 'active')
    .map((industry) => ({ key: industry.key, name: industry.name }));

  return (
    <main id="main-content" tabIndex={-1}>
      <MasterPackageStudio
        packages={packages}
        industries={industries}
        canManage={canManage}
        error={
          templateResult.error
            ? 'Master package data is unavailable. Apply the new database migration before using these controls.'
            : null
        }
      />
    </main>
  );
}
