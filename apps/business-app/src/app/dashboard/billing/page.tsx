import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices, activeOrganization } from '@business-os/auth/server';
import { createGstRepository } from '@business-os/database/gst';
import { DomainError } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { saveGstProfile } from './actions';

export const dynamic='force-dynamic';
const field='w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900';
const filters=[
  {id:'all',label:'All documents'},
  {id:'sales_invoice',label:'Sales invoices'},
  {id:'purchase_bill',label:'Purchase bills'},
  {id:'incoming',label:'Marketplace incoming'},
] as const;
const format=(v:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(v);
export default async function BusinessBilling({searchParams}:{
  searchParams:Promise<{kind?:string}>;
}) {
  const {authorization,client}=await pageServices();
  const context=await activeOrganization();
  if(!context) return <main className="dashboard-shell"><p>Choose a company first.</p><Link href="/dashboard">Company dashboard</Link></main>;
  await authorization.requirePermission(context.organizationId,'invoice.view');
  const gst=createGstRepository(client);
  const query=await searchParams;
  const kind=filters.some(f=>f.id===query.kind)?query.kind as (typeof filters)[number]['id']:'all';
  const [profile,docs]=await Promise.all([gst.profile(context.organizationId),gst.list(context.organizationId,kind)]);
  const grants=context.grants.filter(g=>g.scope.kind==='organization').map(g=>g.permission);
  const canCreate=grants.includes('invoice.create');
  const canManage=grants.includes('billing.manage');
  return <main id="main-content" className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-slate-900 sm:px-7">
    <nav className="text-sm text-slate-500"><Link href="/dashboard">Dashboard</Link> / <Link href="/dashboard/finance">Finance</Link> / GST billing</nav>
    <header className="rounded-3xl bg-slate-950 px-7 py-9 text-white">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-teal-300">Company finance · India</p>
      <h1 className="mt-3 text-3xl font-semibold">Invoices &amp; bills</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Prepare and issue customer invoices, record supplier bills and review GST components. Each business has its own private billing register.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {canCreate&&<Link href="/dashboard/billing/new" className="rounded-xl bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950">+ Create invoice / bill</Link>}
        <a href="#profile" className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-white">GST business profile</a>
      </div>
    </header>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Documents in view</p><strong className="mt-2 block text-2xl">{docs.length}</strong></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Billing profile</p><strong className="mt-2 block">{profile?'Configured':'Needs setup'}</strong></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">GST registration</p><strong className="mt-2 block">{profile?.gstin?'GSTIN saved':'Not registered here'}</strong></div>
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">Document register</h2><p className="text-sm text-slate-500">Latest 100 for each view</p></div>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Document category">
        {filters.map(f=><Link key={f.id} href={'/dashboard/billing?kind='+f.id}
          className={'rounded-full border px-4 py-2 text-sm '+(kind===f.id?'border-slate-950 bg-slate-950 text-white':'border-slate-200 text-slate-600')}>{f.label}</Link>)}
      </nav>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
        <thead><tr className="border-b"><th className="px-3 py-3">Document</th><th className="px-3 py-3">Party</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">View</th></tr></thead>
        <tbody>{docs.map(d=><tr key={d.id} className="border-b border-slate-100">
          <td className="px-3 py-4 font-semibold">{d.number??'Draft'} <span className="block text-xs font-normal text-slate-500">{d.kind==='sales_invoice'?'Sales invoice':'Supplier bill'}</span></td>
          <td className="px-3 py-4">{d.partyName}</td><td className="px-3 py-4">{d.date}</td><td className="px-3 py-4">{format(Number(d.total))}</td>
          <td className="px-3 py-4 capitalize">{d.status}</td>
          <td className="px-3 py-4"><Link href={'/dashboard/billing/'+d.id} className="font-semibold text-blue-700 hover:underline">Open →</Link></td>
        </tr>)}</tbody>
      </table></div>
      {!docs.length&&<p className="py-10 text-center text-sm text-slate-500">No documents in this category yet.</p>}
    </section>
    <section id="profile" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Business billing identity</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Provide the legal invoice address, registration state, optional GSTIN and signatory. The details are frozen into an issued invoice, so updates will not alter historical documents.</p>
      {canManage?
      <ActionForm action={saveGstProfile} label="Save business billing identity">
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">Legal business name
            <input required name="legalName" defaultValue={profile?.legalName??''} minLength={2} maxLength={200} className={field}/></label>
          <label className="grid gap-2 text-sm font-semibold">State code (e.g. Telangana 36)
            <input required name="stateCode" pattern="[0-9]{2}" maxLength={2} defaultValue={profile?.stateCode??'36'} className={field}/></label>
          <label className="grid gap-2 text-sm font-semibold">GSTIN (leave blank if unregistered)
            <input name="gstin" maxLength={15} defaultValue={profile?.gstin??''} placeholder="36ABCDE1234F1Z5" className={field}/></label>
          <label className="grid gap-2 text-sm font-semibold">Authorized signatory
            <input name="authorizedSignatory" defaultValue={profile?.authorizedSignatory??''} maxLength={150} className={field}/></label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Registered billing address
            <textarea required name="address" rows={3} minLength={5} maxLength={1000} defaultValue={profile?.address??''} className={field}/></label>
        </div>
      </ActionForm>:
      <div className="mt-4 text-sm text-slate-600">{profile?<><p>{profile.legalName}</p><p>{profile.address}</p><p>GSTIN: {profile.gstin??'Not registered'}</p></>:<p>Ask your company administrator to configure billing details.</p>}</div>}
    </section>
    <p className="pb-6 text-sm leading-6 text-slate-500">These documents provide GST-ready accounting details but do not submit GST returns, validate GSTIN against government records, generate e-invoice IRNs or verify legal tax classification. Consult your tax professional before issuing statutory documents.</p>
  </main>;
}
