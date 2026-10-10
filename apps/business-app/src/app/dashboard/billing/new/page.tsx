import Link from 'next/link';
import { financeServices } from '../../finance/service';
import { createTradeBillingRepository, type TradeDraft } from '@business-os/database/trade-billing';
import { TradeDocumentEditor } from '../document-editor';
import { idSchema } from '@business-os/shared';

export const dynamic='force-dynamic';
export default async function NewTradeDocument({searchParams}:{
  searchParams:Promise<{kind?:string;edit?:string}>;
}){
  const s=await financeServices('invoice.create',true);
  const query=await searchParams;
  const trade=createTradeBillingRepository(s.client,s.org);
  const profile=await trade.profile();
  const defaultKind=query.kind==='purchase_bill'?'purchase_bill':'sales_invoice';
  let initial:TradeDraft|undefined;
  if(query.edit&&idSchema.safeParse(query.edit).success){
    const doc=await trade.document(query.edit);
    if(doc.status==='draft'){
      const party=doc.kind==='sales_invoice'?doc.receiver:doc.issuer;
      initial={
        id:doc.id,kind:doc.kind,issueDate:doc.issueDate,dueDate:doc.dueDate??'',
        counterparty:party,placeOfSupply:doc.placeOfSupply,
        deliveryAddress:doc.deliveryAddress,reverseCharge:doc.reverseCharge,
        lines:doc.lines.map(l=>({description:l.description,hsn:l.hsn,unit:l.unit,quantity:l.quantity,rate:l.rate,gstRate:l.gstRate})),
        notes:doc.notes,reference:doc.reference,
      };
    }
  }
  return <main id="main-content" className="min-h-screen bg-slate-50 px-5 py-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/dashboard/billing" className="text-sm font-semibold text-slate-700 hover:underline">← Billing register</Link>
      {!profile?<div className="rounded-2xl border bg-white p-7"><h1 className="text-xl font-bold">Billing profile required</h1>
        <p className="my-3">Add your business address, GSTIN (if registered), state and invoice prefix first.</p>
        <Link href="/dashboard/billing/settings" className="text-blue-700 underline">Set up company billing details →</Link></div>:
        <TradeDocumentEditor defaultKind={defaultKind} companyState={profile.state} {...(initial?{initial}:{})}/>}
    </div>
  </main>;
}
