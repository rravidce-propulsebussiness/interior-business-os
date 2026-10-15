import { catalogPage } from '../../catalog/access';
import { pageServices } from '@business-os/auth/server';
import { createConstructionPackagesRepository } from '@business-os/database/construction-packages';
import { createQuotationPackagesRepository } from '@business-os/database/quotation-packages';
import { ConstructionPackagesManager } from '../../pricing/construction/package-manager';
import { QuotationPackagesManager } from '../package-manager';
import { QuotationStudioFrame } from '../studio-frame';
import { QuotationPackageTabs } from './package-tabs';

export const dynamic = 'force-dynamic';

export default async function QuotationPackagesPage() {
  const { org, canManagePrice } = await catalogPage(true);
  const { client, repository, authorization } = await pageServices();
  const [organization, user, industries, construction, configurable] =
    await Promise.all([
      repository.organization(org),
      authorization.requireAuthenticatedUser(),
      repository.industries(),
      createConstructionPackagesRepository(client).list(org),
      createQuotationPackagesRepository(client)
        .list(org)
        .catch(() => null),
    ]);
  if (!organization) throw new Error('Company workspace unavailable');
  return (
    <QuotationStudioFrame
      companyName={organization.name}
      accountEmail={user.email ?? ''}
    >
      <div className="qs-heading">
        <div className="qs-heading-label">
          <div>
            <h1>Packages</h1>
          </div>
        </div>
      </div>
      <QuotationPackageTabs
        constructionCount={construction.length}
        otherCount={configurable?.length ?? 0}
        construction={<ConstructionPackagesManager
          packages={construction}
          canManage={canManagePrice}
        />}
        other={configurable === null ? (
          <div className="qs-warning">
            The new industry package storage is not yet available in this
            database. Apply migration 20261013000900_quotation_packages.sql to
            activate interior package editing.
          </div>
        ) : (
          <QuotationPackagesManager
            packages={configurable}
            industries={industries
              .filter(
                (industry) =>
                  industry.status === 'active' &&
                  industry.key !== 'construction',
              )
              .map((i) => ({ key: i.key, name: i.name }))}
            canManage={canManagePrice}
            currency={organization.default_currency || 'INR'}
          />
        )}
      />
    </QuotationStudioFrame>
  );
}
