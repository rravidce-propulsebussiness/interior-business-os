import Link from 'next/link';
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
          <span className="qs-heading-icon">▦</span>
          <div>
            <h1>Quotation Package Manager</h1>
            <p>Manage construction, interior and future-industry packages.</p>
          </div>
        </div>
        <Link href="/dashboard/quotations/new" className="qs-btn primary">+ Create quotation</Link>
        <Link href="/dashboard/quotations" className="qs-btn">
          ← Quotations
        </Link>
      </div>
      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-slate-700">
        <strong className="text-blue-800">
          Each company owns its packages.
        </strong>{' '}
        Changing package rates affects future quotation calculations only.
        Existing issued PDFs, amounts and revisions remain unchanged.
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
