import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createMarketplaceRepository } from '@business-os/database/marketplace';

export const dynamic = 'force-dynamic';

export default async function MarketplaceOrders({ searchParams }: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const params=await searchParams;
  const { authorization,client }=await pageServices();
  const context=await activeOrganization();
  if (!context) return <main id="main-content" className="dashboard-shell"><h1>Purchase requests</h1><p>Select a company first.</p><Link href="/dashboard">Go to dashboard →</Link></main>;
  await authorization.requirePermission(context.organizationId,'purchase.view');
  const orders=await createMarketplaceRepository(client).orders(context.organizationId,'buyer');
  return <main id="main-content" className="dashboard-shell tenant-dashboard-v2">
    <header className="tenant-v2-topbar"><Link className="tenant-v2-brand" href="/dashboard/marketplace">
      <span className="tenant-v2-monogram">P</span><span><strong>Purchase requests</strong><small>Company marketplace orders</small></span>
    </Link><Link className="premium-link-secondary" href="/dashboard/marketplace">← Back to marketplace</Link></header>
    <section className="tenant-v2-hero"><div><p className="eyebrow">B2B sourcing</p><h1>My purchase requests</h1>
      <p className="tenant-v2-lead">Track requests you sent to suppliers. Rates are preserved at the time of your request.</p>
      </div><div className="tenant-v2-art" aria-hidden="true"><span>PO</span></div></section>
    {params.updated && <p className="notice notice-success" role="status">Purchase request submitted. The seller can now review it.</p>}
    <section className="tenant-v2-panel my-5">
      <div className="flex items-center justify-between"><h2>Requests ({orders.length})</h2><Link href="/dashboard/marketplace" className="premium-link-secondary">Browse products</Link></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-3">Product</th><th className="p-3">Seller</th><th className="p-3">Qty</th><th className="p-3">Unit rate</th><th className="p-3">Total</th><th className="p-3">Status</th></tr></thead>
        <tbody>{orders.map(order=><tr className="border-t border-slate-600/30" key={order.id}>
          <td className="p-3">{order.productName}</td><td className="p-3">{order.sellerName}</td><td className="p-3">{order.quantity}</td>
          <td className="p-3">{order.currency} {Number(order.unitPrice).toLocaleString('en-IN')}</td>
          <td className="p-3">{order.currency} {Number(order.total).toLocaleString('en-IN')}</td><td className="p-3">{order.status}</td>
        </tr>)}</tbody></table></div>
      {orders.length===0 && <p className="muted py-4">You haven't requested any products yet.</p>}
      <p className="muted mt-4 text-sm">An accepted request does not represent a completed payment or confirmed delivery. Final payment, tax, delivery and stock terms must be arranged with the seller.</p>
    </section>
  </main>;
}
