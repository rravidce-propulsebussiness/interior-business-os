'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { saveProjectSite } from './actions';

type Requirement = {
  material_id: string;
  name: string;
  unit: string;
  request_quantity: number;
  required_quantity: number;
  request_status: 'requested'|'approved'|'ordered'|'received'|'rejected';
  source: 'undecided'|'marketplace'|'outside';
  vendor_reference: string;
  work_date: string;
  stage_id: string;
  stage_title: string;
  plan_id: string;
  readiness: 'approval_required'|'ordering_required'|'delivery_pending'|'site_marked_received'|'blocked';
};
export type ConstructionProcurementData = {
  can_update: boolean;
  materials: Requirement[];
};
type Grouped = Requirement & {
  usages: { stage_title: string; work_date: string; needed: number }[];
  total_planned: number;
};
const inputStyle = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900';

const statusLabels: Record<Requirement['readiness'],string> = {
  approval_required:'Approval required',
  ordering_required:'Place order',
  delivery_pending:'Await delivery',
  site_marked_received:'Marked received at site',
  blocked:'Needs attention',
};

export function ConstructionProcurementWatch({
  projectId,
  data,
}: {
  projectId: string;
  data: ConstructionProcurementData;
}) {
  const [pending,start] = useTransition();
  const [notice,setNotice] = useState('');
  const [sources,setSources] = useState<Record<string,'marketplace'|'outside'>>({});
  const [vendors,setVendors] = useState<Record<string,string>>({});
  const [receipts,setReceipts] = useState<Record<string,boolean>>({});
  const groups=useMemo(() => {
    const map=new Map<string,Grouped>();
    for(const material of data.materials){
      const previous=map.get(material.material_id);
      const usage={stage_title:material.stage_title,work_date:material.work_date,needed:material.required_quantity};
      if(previous){
        previous.total_planned+=material.required_quantity;
        previous.usages.push(usage);
      } else {
        map.set(material.material_id,{...material,total_planned:material.required_quantity,usages:[usage]});
      }
    }
    return Array.from(map.values()).sort((a,b)=>{
      const rank:Record<Requirement['readiness'],number>={
        approval_required:0,ordering_required:1,delivery_pending:2,
        blocked:3,site_marked_received:4,
      };
      return rank[a.readiness]-rank[b.readiness] || a.work_date.localeCompare(b.work_date);
    });
  },[data.materials]);

  const toOrder=groups.filter(x=>['approval_required','ordering_required'].includes(x.readiness));
  const pendingDelivery=groups.filter(x=>x.readiness==='delivery_pending');
  const received=groups.filter(x=>x.readiness==='site_marked_received');

  const transition=(material:Grouped,next:'approved'|'ordered'|'received'|'rejected')=>{
    const source=next==='ordered'||next==='received'
      ? sources[material.material_id]??(material.source==='undecided'?'outside':material.source)
      : 'undecided';
    const vendor=vendors[material.material_id]??material.vendor_reference;
    if(next==='received' && !receipts[material.material_id]){
      setNotice('Confirm actual physical delivery before recording site receipt.');
      return;
    }
    if((next==='ordered'||next==='received') && vendor.trim().length<3){
      setNotice('Enter the real purchase-order number or supplier reference.');
      return;
    }
    const form=new FormData();
    form.set('id',material.material_id);
    form.set('status',next);
    form.set('source',source);
    form.set('vendor_reference',vendor.trim());
    start(async()=>{
      const result=await saveProjectSite(projectId,'material_update',form);
      setNotice(result.saved
        ? 'Site material status updated. The canonical procurement and stock ledgers remain separate.'
        : result.message);
      if(result.saved)setReceipts((old)=>({...old,[material.material_id]:false}));
    });
  };

  return (
    <section id="construction-material-readiness" className="sc-panel rounded-2xl border p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
            Construction · Procurement readiness
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">What materials must be arranged?</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            This queue uses only approved future work plans and their existing material requests.
            It does not assume that ordered goods have arrived or that site receipt
            equals verified inventory stock.
          </p>
        </div>
        <Link href="/dashboard/operations/materials" className="text-sm font-bold text-blue-700 underline">
          Operations inventory →
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          {name:'Approve / order',count:toOrder.length},
          {name:'Await delivery',count:pendingDelivery.length},
          {name:'Marked received',count:received.length},
        ].map((item)=>(
          <div key={item.name} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xl font-bold text-slate-900">{item.count}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{item.name}</p>
          </div>
        ))}
      </div>
      {groups.length===0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          No materials are attached to currently approved work plans for the next 14 days.
          Create a site material requirement and link it in tomorrow&apos;s stage plan first.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {groups.map((material)=>{
            const source=sources[material.material_id]??(
              material.source==='undecided'?'outside':material.source
            );
            const vendor=vendors[material.material_id]??material.vendor_reference;
            const canChange=data.can_update&&material.readiness!=='site_marked_received';
            return (
              <article key={material.material_id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{material.name}</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Planned across upcoming work: {material.total_planned} {material.unit}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Existing request: {material.request_quantity} {material.unit}
                    </p>
                  </div>
                  <span className={'self-start rounded-lg px-2.5 py-1.5 text-xs font-bold '+(
                    material.readiness==='site_marked_received'
                    ? 'bg-emerald-50 text-emerald-900'
                    : material.readiness==='delivery_pending'
                    ? 'bg-blue-50 text-blue-900'
                    : 'bg-amber-50 text-amber-900'
                  )}>{statusLabels[material.readiness]}</span>
                </div>
                {material.total_planned>material.request_quantity && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                    Total planned usage exceeds the existing material request.
                    Confirm quantities before ordering; this is not a verified stock shortage.
                  </p>
                )}
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                  {material.usages.map((usage,i)=>(
                    <p key={i} className="text-xs text-slate-700">
                      {usage.work_date} · {usage.stage_title} — {usage.needed} {material.unit}
                    </p>
                  ))}
                </div>
                {material.vendor_reference && (
                  <p className="mt-3 text-xs text-slate-700">
                    Supplier / PO reference: <strong>{material.vendor_reference}</strong>
                  </p>
                )}
                {canChange && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    {material.request_status==='approved' && (
                      <>
                        <label className="block text-xs font-semibold text-slate-800">
                          Procurement source
                          <select className={inputStyle} value={source}
                            onChange={(e)=>setSources(old=>({...old,[material.material_id]:e.target.value as 'marketplace'|'outside'}))}>
                            <option value="marketplace">Marketplace</option>
                            <option value="outside">Outside supplier</option>
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-slate-800">
                          Real supplier / purchase-order reference
                          <input className={inputStyle} value={vendor} maxLength={500}
                            placeholder="Required before recording an order"
                            onChange={(e)=>setVendors(old=>({...old,[material.material_id]:e.target.value}))} />
                        </label>
                      </>
                    )}
                    {material.request_status==='ordered' && (
                      <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                        <input type="checkbox" className="mt-0.5" checked={Boolean(receipts[material.material_id])}
                          onChange={(e)=>setReceipts(old=>({...old,[material.material_id]:e.target.checked}))} />
                        I checked the actual site delivery before recording receipt.
                        Separate goods receipt and stock posting are still required in Operations.
                      </label>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {material.request_status==='requested' && <>
                        <button type="button" disabled={pending} onClick={()=>transition(material,'approved')}
                          className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Approve request</button>
                        <button type="button" disabled={pending} onClick={()=>transition(material,'rejected')}
                          className="rounded-xl border border-red-300 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-50">Reject</button>
                      </>}
                      {material.request_status==='approved' && (
                        <button type="button" disabled={pending} onClick={()=>transition(material,'ordered')}
                          className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                          Record existing supplier order
                        </button>
                      )}
                      {material.request_status==='ordered' && (
                        <button type="button" disabled={pending||!receipts[material.material_id]}
                          onClick={()=>transition(material,'received')}
                          className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                          Mark physical site receipt
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {notice && <p className="mt-4 text-sm font-semibold text-blue-800" role="status">{notice}</p>}
    </section>
  );
}
