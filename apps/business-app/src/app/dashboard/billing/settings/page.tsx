import Link from 'next/link';
import { financeServices } from '../../finance/service';
import { createTradeBillingRepository } from '@business-os/database/trade-billing';
import { ActionForm } from '@business-os/ui/action-form';
import { saveTradeProfile } from '../actions';
export const dynamic='force-dynamic';
const field='rounded-lg border border-slate-300 bg-white p-3 text-slate-900 w-full';
export default async function GstSettings(){
 const s=await financeServices('invoice.view',true);
 const profile=await createTradeBillingRepository(s.client,s.org).profile();
 return <main id="main-content" className="min-h-screen bg-slate-50 px-5 py-9 text-slate-900">
 <div className="mx-auto max-w-3xl space-y-5">
  <Link href="/dashboard/billing" className="text-sm text-blue-700 hover:underline">← Back to billing</Link>
  <header><p className="text-xs uppercase tracking-widest text-teal-700">Business billing</p>
  <h1 className="mt-2 text-3xl font-semibold">Company GST details</h1>
  <p className="mt-2 text-sm text-slate-600">These values identify your organization as the supplier on sales invoices and recipient on purchase bills. Issued documents retain their original snapshots.</p></header>
  <section className="rounded-2xl border bg-white p-6 shadow-sm">
  {s.allowed('billing.manage')?<ActionForm action={saveTradeProfile} label="Save GST billing profile">
    <label className="grid gap-2 text-sm font-semibold">Business / legal name<input required name="name" minLength={2} maxLength={200} className={field} defaultValue={profile?.name??''}/></label>
    <label className="grid gap-2 text-sm font-semibold">Registered business address<textarea required name="address" minLength={5} maxLength={2000} rows={3} className={field} defaultValue={profile?.address??''}/></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">GSTIN (if GST-registered)<input name="gstin" maxLength={15} className={field} defaultValue={profile?.gstin??''} placeholder="15-character GSTIN"/></label>
      <label className="grid gap-2 text-sm font-semibold">State code (2 digits)<input name="state" required maxLength={2} pattern="[0-9]{2}" className={field} defaultValue={profile?.state??''} placeholder="36"/></label>
      <label className="grid gap-2 text-sm font-semibold">Invoice prefix (2–6 letters/numbers)<input name="prefix" required maxLength={6} pattern="[A-Z0-9]{2,6}" className={field} defaultValue={profile?.prefix??'INV'} placeholder="INV"/></label>
    </div>
    <p className="text-xs text-slate-500">Example invoice: INV-26-000001. Invoice numbers are assigned when issued and remain unique within the organization's financial year.</p>
  </ActionForm>:<p className="text-sm text-slate-600">Your account can view billing settings but cannot edit them. Contact your company administrator.</p>}
  </section>
  <p className="text-sm text-amber-800">The GSTIN pattern is checked, but registration status is not verified against the GST portal. An authorized representative's signature, applicable legal declarations and IRN/QR code (where required) remain your responsibility.</p>
 </div></main>;
}
