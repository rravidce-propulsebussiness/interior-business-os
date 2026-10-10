import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createGstRepository, type GstDocument } from '@business-os/database/gst';
import { createMarketplaceRepository } from '@business-os/database/marketplace';
import { DomainError } from '@business-os/shared';
import { DocumentEditor } from '../document-editor';

export const dynamic='force-dynamic';
export default async function PrepareDocument({searchParams}:{
  searchParams:Promise<{edit?:string;order?:string;error?:string}>;
}) {
  const params=await searchParams;
  const context=await activeOrganization();
  if(!context) notFound();
  const {authorization,client}=await pageServices();
  await authorization.requirePermission(context.organizationId,'invoice.create');
  const gst=createGstRepository(client);
  const profile=await gst.profile(context.organizationId);
  let existing:GstDocument|null=null;
  if(params.edit){
    existing=await gst.document(context.organizationId,params.edit);
    if(!existing.isOwner||existing.status!=='draft')notFound();
    await authorization.requirePermission(context.organizationId,'invoice.manage');
  }
  let order:null|{id:string;productName:string;buyerName:string;quantity:number;unitPrice:number}=null;
  if(params.order){
    await authorization.requirePermission(context.organizationId,'catalog.manage');
    const orders=await createMarketplaceRepository(client).orders(context.organizationId,'seller');
    const matched=orders.find(o=>o.id===params.order&&o.status==='accepted');
    if(!matched)notFound();
    order={id:matched.id,productName:matched.productName,buyerName:matched.buyerName,
      quantity:Number(matched.quantity),unitPrice:Number(matched.unitPrice)};
  }
  return <main id="main-content" className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-slate-900 sm:px-7">
    <nav className="text-sm text-slate-500"><Link href="/dashboard">Dashboard</Link> / <Link href="/dashboard/billing">GST billing</Link> / Prepare</nav>
    <header className="rounded-3xl bg-slate-950 px-7 py-8 text-white"><p className="text-xs font-bold uppercase tracking-widest text-teal-300">GST-ready billing</p>
      <h1 className="mt-3 text-3xl font-semibold">{existing?'Edit document draft':order?'Invoice marketplace buyer':'Prepare a new invoice or bill'}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Save a draft before final issuance. GST tax rates must be selected from applicable law; invoice numbers and calculations are assigned and frozen by the server.</p>
    </header>
    {params.error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      The document could not be saved: {params.error}. Check GSTIN, rates, required fields and company permissions.
    </div>}
    {!profile?<section className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <h2 className="text-lg font-semibold">Set up your business billing identity first</h2>
      <p className="mt-2 text-sm">Your legal business name, registered address and state code are required to prepare invoices.</p>
      <Link href="/dashboard/billing#profile" className="mt-3 inline-block font-semibold text-blue-700 underline">Configure billing profile →</Link>
    </section>:<DocumentEditor existing={existing} order={order} profile={profile}/>}
  </main>;
}
