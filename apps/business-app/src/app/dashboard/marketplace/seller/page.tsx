import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createMarketplaceRepository } from '@business-os/database/marketplace';
import { applyAsSeller, saveMarketplaceProduct, decideMarketplaceOrder } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SellerCenter({ searchParams }: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const params = await searchParams;
  const { authorization, repository, client } = await pageServices();
  const context = await activeOrganization();
  if (!context) return <main id="main-content" className="dashboard-shell"><h1>Seller account</h1>
    <p>Select your company first.</p><Link href="/dashboard">Go to dashboard →</Link></main>;
  await authorization.requirePermission(context.organizationId,'organization.manage');
  const marketplace=createMarketplaceRepository(client);
  const [seller, industries] = await Promise.all([
    marketplace.sellerProfile(context.organizationId),
    repository.industries(),
  ]);
  const orders = seller ? await marketplace.orders(context.organizationId,'seller') : [];
  const currency = (await repository.organization(context.organizationId)).default_currency;
  return <main id="main-content" className="dashboard-shell tenant-dashboard-v2">
    <header className="tenant-v2-topbar"><Link href="/dashboard/marketplace" className="tenant-v2-brand">
      <span className="tenant-v2-monogram">P</span><span><strong>Seller Centre</strong><small>Manage your B2B supply business</small></span></Link>
      <Link className="premium-link-secondary" href="/dashboard/marketplace">← Browse marketplace</Link>
    </header>
    <section className="tenant-v2-hero"><div><p className="eyebrow">Supplier account</p>
      <h1>{seller?.name ?? 'Become a seller'}</h1>
      <p className="tenant-v2-lead">Publish products and rates for the industries your company serves. Every seller has an independent storefront and purchase requests.</p>
      {seller && <span className="status-chip">Seller status: {seller.status}</span>}
    </div><div className="tenant-v2-art" aria-hidden="true"><span>SELL</span></div></section>
    {params.error && <p className="tenant-v2-alert" role="alert">Update failed ({params.error}). Verify your access, industry, rate and seller approval.</p>}
    {params.updated && <p role="status" className="notice notice-success">{params.updated === 'application' ? 'Seller application submitted for platform review.' : 'Marketplace update saved.'}</p>}
    {!seller && <section className="tenant-v2-panel my-5">
      <h2>Apply for a supplier account</h2>
      <p className="muted mb-4">Your existing Business OS company becomes your seller profile. A platform administrator must approve it before your products appear in the marketplace.</p>
      <form action={applyAsSeller} className="grid gap-4 max-w-lg">
        <label className="grid gap-2">Storefront name
          <input name="storeName" minLength={2} maxLength={150} required placeholder="Registered supplier or store name" className="rounded-lg border p-3 text-slate-900 bg-white"/>
        </label><button type="submit" className="premium-link">Submit seller application</button>
      </form>
    </section>}
    {seller && seller.status !== 'approved' && <section className="tenant-v2-panel my-5">
      <h2>{seller.status === 'pending' ? 'Application awaiting verification' : 'Seller account not active'}</h2>
      <p className="muted">Platform approval is required before adding and publishing products. Contact the marketplace administrator if you need a status review.</p>
    </section>}
    {seller?.status === 'approved' && <>
      <section className="tenant-v2-panel my-5">
        <p className="eyebrow">Product catalog</p><h2>Add a material or product</h2>
        <p className="muted mb-4">Industry selections are loaded from the active platform registry. Only industries associated with your company can be published.</p>
        <form action={saveMarketplaceProduct} className="grid md:grid-cols-2 gap-4">
          <label className="grid gap-1">Industry
            <select required name="industryId" className="rounded-lg border p-3 text-slate-900 bg-white">
              {industries.map(industry=><option value={industry.id} key={industry.id}>{industry.name}</option>)}
            </select></label>
          <label className="grid gap-1">SKU
            <input required name="sku" maxLength={64} className="rounded-lg border p-3 text-slate-900 bg-white" placeholder="PLY-001"/></label>
          <label className="grid gap-1">Product name
            <input required name="name" minLength={2} maxLength={160} className="rounded-lg border p-3 text-slate-900 bg-white" placeholder="Product name"/></label>
          <label className="grid gap-1">Category
            <input required name="category" minLength={2} maxLength={100} className="rounded-lg border p-3 text-slate-900 bg-white" placeholder="Plywood, tiles, equipment, textiles..."/></label>
          <label className="grid gap-1">Unit
            <input required name="unit" maxLength={30} className="rounded-lg border p-3 text-slate-900 bg-white" placeholder="sheet, bag, kg, piece"/></label>
          <label className="grid gap-1">Unit price ({currency})
            <input type="number" name="price" step="0.01" min="0.01" required className="rounded-lg border p-3 text-slate-900 bg-white"/></label>
          <label className="grid gap-1">Minimum quantity
            <input type="number" name="minQuantity" step="0.001" min="0.001" defaultValue={1} required className="rounded-lg border p-3 text-slate-900 bg-white"/></label>
          <label className="grid gap-1">Visibility
            <select name="status" className="rounded-lg border p-3 text-slate-900 bg-white"><option value="draft">Save draft</option><option value="published">Publish listing</option></select></label>
          <input type="hidden" name="currency" value={currency}/>
          <button className="premium-link" type="submit">Save product</button>
        </form>
      </section>
      <section className="tenant-v2-panel my-5">
        <h2>My product listings ({seller.products.length})</h2>
        <div className="grid gap-3">
          {seller.products.map(product=><details key={product.id} className="rounded-xl border border-slate-600/30 p-4">
            <summary className="cursor-pointer font-semibold">{product.name} · {product.currency} {product.price}/{product.unit} · {product.status}</summary>
            <form action={saveMarketplaceProduct} className="grid md:grid-cols-2 gap-3 mt-4">
              <input type="hidden" name="id" value={product.id}/>
              <label className="grid gap-1">Industry
                <select defaultValue={product.industryId} name="industryId" className="rounded-lg border p-3 text-slate-900 bg-white">
                  {industries.map(industry=><option value={industry.id} key={industry.id}>{industry.name}</option>)}
                </select></label>
              {(['sku','name','category','unit'] as const).map(key=><label key={key} className="grid gap-1">{key}
                <input required name={key} defaultValue={product[key]} className="rounded-lg border p-3 text-slate-900 bg-white"/></label>)}
              <label className="grid gap-1">Price
                <input required type="number" step="0.01" name="price" defaultValue={product.price} className="rounded-lg border p-3 text-slate-900 bg-white"/></label>
              <label className="grid gap-1">Minimum quantity
                <input required type="number" step="0.001" name="minQuantity" defaultValue={product.minQuantity} className="rounded-lg border p-3 text-slate-900 bg-white"/></label>
              <label className="grid gap-1">Status
                <select name="status" defaultValue={product.status} className="rounded-lg border p-3 text-slate-900 bg-white"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
              <input type="hidden" name="currency" value={product.currency}/>
              <button className="premium-link" type="submit">Update listing</button>
            </form>
          </details>)}
          {seller.products.length===0 && <p className="muted">No products listed yet.</p>}
        </div>
      </section>
      <section className="tenant-v2-panel my-5">
        <h2>Incoming purchase requests ({orders.length})</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th className="p-3">Buyer</th><th className="p-3">Material</th><th className="p-3">Quantity</th><th className="p-3">Quoted total</th><th className="p-3">Status</th><th className="p-3">Respond</th></tr></thead>
          <tbody>{orders.map(order=><tr key={order.id} className="border-t border-slate-600/30">
            <td className="p-3">{order.buyerName}</td><td className="p-3">{order.productName}</td>
            <td className="p-3">{order.quantity}</td><td className="p-3">{order.currency} {order.total}</td><td className="p-3">{order.status}</td>
            <td className="p-3">{order.status==='requested' && <form action={decideMarketplaceOrder} className="flex gap-2 flex-wrap">
              <input type="hidden" name="orderId" value={order.id}/>
              <button name="action" value="accept" type="submit" className="premium-link-secondary">Accept</button>
              <button name="action" value="reject" type="submit" className="premium-link-secondary">Decline</button>
            </form>}</td>
          </tr>)}</tbody></table></div>
        {orders.length===0 && <p className="muted">No incoming requests.</p>}
      </section>
    </>}
  </main>;
}
