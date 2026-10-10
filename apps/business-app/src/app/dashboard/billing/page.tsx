import Link from 'next/link';
import { financeServices } from '../finance/service';
import { createTradeBillingRepository } from '@business-os/database/trade-billing';

export const dynamic = 'force-dynamic';
export default async function TradeBilling({searchParams}:{
  searchParams:Promise<{kind?:string}>;
}){
  const s=await financeServices('invoice.view',true);
  const q=await searchParams;
  const kind=q.kind==='sales_invoice'||q.kind==='purchase_bill'?q.kind:undefined;
  const trade=createTradeBillingRepository(s.client,s.org);
  const [profile,documents]=await Promise.all([trade.profile(),trade.list(kind)]);
  const money=(amount:number)=>'₹'+Number(amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const revenue=documents.filter(d=>d.kind==='sales_invoice'&&d.status==='issued').reduce((sum,d)=>sum+Number(d.total),0);
  const payable=documents.filter(d=>d.kind==='purchase_bill'&&d.status==='issued').reduce((sum,d)=>sum+Number(d.balance),0);
  return <main id="main-content" className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/dashboard" className="text-sm font-semibold text-slate-600 hover:underline">← Business dashboard</Link>
      <header className="rounded-3xl bg-slate-950 px-7 py-8 text-white">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-300">ProPulse Business OS · Finance</p>
        <h1 className="mt-2 text-3xl font-semibold">Invoices &amp; purchase bills</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Sell materials or services, record bills from suppliers, and prepare GST details across all industries. Company finances remain private to your business.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {s.allowed('invoice.create')&&<><Link className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-950" href="/dashboard/billing/new?kind=sales_invoice">＋ New sales invoice</Link>
            <Link className="rounded-xl border border-slate-500 px-4 py-2.5 text-sm font-semibold text-white" href="/dashboard/billing/new?kind=purchase_bill">＋ Record purchase bill</Link></>}
          <Link className="rounded-xl border border-slate-500 px-4 py-2.5 text-sm font-semibold text-white" href="/dashboard/billing/settings">Company GST settings</Link>
        </div>
      </header>
      {!profile&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Set up your company billing details before creating invoices. <Link className="underline font-bold" href="/dashboard/billing/settings">Complete billing profile →</Link></p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Documents displayed</p><strong className="mt-2 block text-2xl">{documents.length}</strong></div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Issued sales value</p><strong className="mt-2 block text-2xl">{money(revenue)}</strong></div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Outstanding purchase bills</p><strong className="mt-2 block text-2xl">{money(payable)}</strong></div>
      </div>
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Billing register</h2>
          <nav aria-label="Billing filters" className="flex flex-wrap gap-2 text-sm font-semibold">
            {([{key:'',label:'All'},{key:'sales_invoice',label:'Sales invoices'},{key:'purchase_bill',label:'Purchase bills'}] as const)
            .map(filter=><Link key={filter.key} href={'/dashboard/billing'+(filter.key?'?kind='+filter.key:'')}
              className={'rounded-lg px-3 py-2 '+(kind===filter.key||!kind&&!filter.key?'bg-slate-900 text-white':'bg-slate-100 text-slate-600')}>
              {filter.label}</Link>)}
          </nav>
        </div>
        {documents.length===0?<div className="py-12 text-center text-slate-600"><h3 className="text-lg font-semibold text-slate-900">No documents yet</h3><p className="mt-2 text-sm">Create a sales invoice or register an incoming supplier bill to begin.</p></div>:
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Number</th><th className="p-3">Type</th><th className="p-3">Party</th><th className="p-3">Total</th><th className="p-3">Balance</th><th className="p-3">Status</th></tr></thead>
          <tbody>{documents.map(d=><tr key={d.id} className="border-b border-slate-100">
            <td className="p-3 font-semibold"><Link className="text-blue-700 hover:underline" href={'/dashboard/billing/'+d.id}>{d.number||'Draft'}</Link></td>
            <td className="p-3">{d.kind==='sales_invoice'?'Sales invoice':'Purchase bill'}</td>
            <td className="p-3">{d.party}</td>
            <td className="p-3">{money(d.total)}</td><td className="p-3">{money(d.balance)}</td>
            <td className="p-3 capitalize">{d.status}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <p className="text-xs leading-5 text-slate-500">GST-preparation only. Review classifications, tax rates, place-of-supply rules and e-invoicing applicability with your tax professional. No GST return, IRN, e-way bill or electronic payment is submitted by this feature.</p>
      <Link className="text-sm text-blue-700 hover:underline" href="/dashboard/finance">Open existing project-finance ledger →</Link>
    </div>
  </main>;
}
