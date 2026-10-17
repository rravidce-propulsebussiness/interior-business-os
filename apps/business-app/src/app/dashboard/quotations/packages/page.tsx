import { catalogPage } from '../../catalog/access';
import { pageServices } from '@business-os/auth/server';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { createConstructionPackagesRepository } from '@business-os/database/construction-packages';
import { createQuotationPackagesRepository } from '@business-os/database/quotation-packages';
import { QuotationStudioFrame } from '../studio-frame';
import { PackageLibrary } from './package-library';

export const dynamic = 'force-dynamic';

/** Packages are tenant-owned templates. A Customized Quote is a quote mode,
 * never a global template or a separate package record. */
export default async function QuotationPackagesPage() {
  const { org, canManagePrice } = await catalogPage(true);
  const { client, repository, authorization } = await pageServices();
  const [organization, user, industries, construction, rates, configurable] =
    await Promise.all([
      repository.organization(org),
      authorization.requireAuthenticatedUser(),
      repository.industries(),
      createConstructionPackagesRepository(client).list(org),
      createConstructionRatesRepository(client).list(org),
      createQuotationPackagesRepository(client).list(org).catch(() => null),
    ]);
  if (!organization) throw new Error('Company workspace unavailable');
  return (
    <QuotationStudioFrame
      companyName={organization.name}
      accountEmail={user.email ?? ''}
    >
      <PackageLibrary
        construction={construction}
        rates={rates}
        other={configurable}
        industries={industries.filter((i) =>
          i.status === 'active' && i.key !== 'construction').map((i) => ({
            key: i.key, name: i.name,
          }))}
        canManage={canManagePrice}
        currency={organization.default_currency || 'INR'}
      />
    </QuotationStudioFrame>
  );
}
