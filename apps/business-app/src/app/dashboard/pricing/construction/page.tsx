import Link from 'next/link';
import { catalogPage } from '../../catalog/access';
import { pageServices } from '@business-os/auth/server';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { ConstructionRatesManager } from './rates-manager';

export const dynamic = 'force-dynamic';

export default async function ConstructionPricing() {
  const { org, canManagePrice } = await catalogPage(true);
  const { client } = await pageServices();
  const rates = await createConstructionRatesRepository(client).list(org);
  return (
    <main
      id="main-content"
      className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-7"
    >
      <nav className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
        <Link href="/dashboard/pricing" className="hover:text-blue-700">
          ← Pricing
        </Link>
        <span>/</span>
        <span>Construction material rates</span>
        <Link
          href="/dashboard/quotations"
          className="ml-auto text-blue-700 hover:underline"
        >
          Open quotations →
        </Link>
      </nav>
      <ConstructionRatesManager rates={rates} canManage={canManagePrice} />
    </main>
  );
}
