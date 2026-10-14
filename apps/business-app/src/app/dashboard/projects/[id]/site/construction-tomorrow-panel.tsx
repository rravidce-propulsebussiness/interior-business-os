'use client';

import { useState, useTransition } from 'react';
import {
  reviewConstructionTomorrowPlan,
  submitConstructionTomorrowPlan,
  type TomorrowResult,
} from './construction-tomorrow-actions';

type Material = {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  status: string;
};
type TomorrowPlan = {
  id: string;
  stage_id: string;
  work_date: string;
  revision: number;
  work_summary: string;
  labor_plan: { trade: string; workers: number }[];
  instructions: string;
  status: string;
  submitted_at: string;
  materials: (Material & { required_quantity: number })[];
};
export type ConstructionTomorrowData = {
  can_approve: boolean;
  can_submit: boolean;
  material_choices: Material[];
  plans: TomorrowPlan[];
};
type StageOption = { id: string; title: string; instance_code: string };
type LaborRow = { trade: string; workers: string };
type MaterialRow = { id: string; quantity: string };
const field = 'mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-blue-600';
const outlined = 'rounded-xl border border-blue-300 bg-white px-3.5 py-2.5 text-xs font-bold text-blue-800 disabled:opacity-50';

export function ConstructionTomorrowPanel({
  projectId,
  stages,
  data,
}: {
  projectId: string;
  stages: StageOption[];
  data: ConstructionTomorrowData;
}) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState('');
  const [labor, setLabor] = useState<LaborRow[]>([{ trade: 'Masons', workers: '2' }]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string,string>>({});
  const labels = new Map(stages.map((stage) => [stage.id, stage.title]));
  const available = data.material_choices.filter((item) => item.status !== 'rejected');
  const run = (task: () => Promise<TomorrowResult>) => start(async () => {
    const result = await task();
    setNotice(result.message);
  });

  return (
    <section className="sc-panel rounded-2xl border p-5 sm:p-7" id="construction-tomorrow-plan">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Tomorrow's Site Plan</p>
      <h2 className="mt-2 text-xl font-bold text-slate-900">Work, labour & required materials</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Engineers prepare tomorrow's stage work with actual trade-wise headcount
        and already recorded material needs. Managers review and approve the plan.
        A proposed material quantity does not place an order or reserve stock.
      </p>
      {data.can_submit && (
        <form className="mt-5 space-y-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = new FormData(event.currentTarget);
            payload.set('labor', JSON.stringify(labor.map((entry) => ({
              trade: entry.trade.trim(), workers: Number(entry.workers),
            }))));
            payload.set('materials', JSON.stringify(materials.map((entry) => ({
              id: entry.id, quantity: Number(entry.quantity),
            }))));
            run(() => submitConstructionTomorrowPlan(projectId, payload));
          }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-800">Construction stage / floor
              <select name="stage_id" required defaultValue="" className={field}>
                <option value="">Choose active work stage</option>
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title} ({stage.instance_code})</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-800">Work date
              <input name="work_date" type="date" required className={field} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-800">Tomorrow's planned activities
            <textarea name="work_summary" required minLength={10} maxLength={3000}
              rows={3} className={field} placeholder="Example: Ground floor footing rebar and cover block checks" />
          </label>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">Labour requirement by trade</p>
              <button type="button" className={outlined} disabled={labor.length>=20}
                onClick={() => setLabor((old) => [...old, {trade:'',workers:'1'}])}>Add trade</button>
            </div>
            <div className="mt-3 space-y-2">
              {labor.map((entry, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-end gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Trade
                    <input className={field} maxLength={70} required
                      placeholder="Bar benders / masons"
                      value={entry.trade}
                      onChange={(event) => setLabor((old) => old.map((row,i) => i===index ? {...row,trade:event.target.value}:row)} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Workers
                    <input className={field} type="number" min="1" max="300" required
                      value={entry.workers}
                      onChange={(event) => setLabor((old) => old.map((row,i) => i===index ? {...row,workers:event.target.value}:row)} />
                  </label>
                  <button className={outlined} type="button" disabled={labor.length===1}
                    onClick={() => setLabor((old) => old.filter((_,i)=>i!==index))}>Remove</button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Planned headcount: {labor.reduce((total,row)=>total+(Number(row.workers)||0),0)} workers.
              This is a requirement, not an attendance record.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">Materials needed tomorrow</p>
              <button className={outlined} type="button"
                disabled={available.length===0||materials.length>=30}
                onClick={()=>setMaterials((old)=>[...old,{id:'',quantity:'1'}])}>Add material</button>
            </div>
            {available.length===0 && <p className="mt-2 text-xs text-amber-800">
              First create the material requirement in Site Delivery / procurement.
              This planner never creates purchase orders.
            </p>}
            <div className="mt-3 space-y-2">
              {materials.map((entry,index)=>(
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-end gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Existing material request
                    <select className={field} required value={entry.id}
                      onChange={(event)=>setMaterials((old)=>old.map((item,i)=>i===index?{...item,id:event.target.value}:item))}>
                      <option value="">Select material</option>
                      {available.filter((item)=>item.id===entry.id||!materials.some((row)=>row.id===item.id))
                        .map((item)=><option key={item.id} value={item.id}>{item.item} · {item.unit}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Qty
                    <input className={field} type="number" required min="0.001" step="0.001"
                      value={entry.quantity}
                      onChange={(event)=>setMaterials((old)=>old.map((item,i)=>i===index?{...item,quantity:event.target.value}:item))} />
                  </label>
                  <button className={outlined} type="button"
                    onClick={()=>setMaterials((old)=>old.filter((_,i)=>i!==index))}>Remove</button>
                </div>
              ))}
            </div>
          </div>
          <label className="block text-xs font-semibold text-slate-800">Site instructions & safety precautions
            <textarea name="instructions" rows={2} maxLength={2500} className={field}
              placeholder="Access, curing, checks before pour, team handoff…" />
          </label>
          <button disabled={pending || stages.length===0} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            Submit tomorrow's work for approval
          </button>
        </form>
      )}
      <div className="mt-7">
        <h3 className="text-base font-bold text-slate-900">Upcoming work plans</h3>
        {data.plans.length===0 && <p className="mt-3 text-sm text-slate-600">No submitted stage work plans yet.</p>}
        <div className="mt-3 space-y-3">
          {data.plans.map((plan)=>{
            const count = plan.labor_plan.reduce((sum,row)=>sum+row.workers,0);
            return (
              <article key={plan.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{plan.work_date} · Revision {plan.revision}</p>
                    <h4 className="mt-1 text-base font-bold text-slate-900">{labels.get(plan.stage_id)??'Project stage'}</h4>
                  </div>
                  <span className={'rounded-full px-3 py-1 text-xs font-bold '+(plan.status==='approved'
                    ?'bg-emerald-50 text-emerald-900'
                    :plan.status==='submitted'?'bg-amber-50 text-amber-900':'bg-slate-100 text-slate-700')}>
                    {plan.status.replaceAll('_',' ')}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{plan.work_summary}</p>
                <p className="mt-3 text-xs font-bold text-slate-900">{count} workers planned</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {plan.labor_plan.map((part,index)=>(
                    <span key={index} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900">
                      {part.trade} · {part.workers}
                    </span>
                  ))}
                </div>
                {plan.materials.length>0 && (
                  <div className="mt-3">
                    <p className="text-xs font-bold text-slate-900">Linked material needs</p>
                    {plan.materials.map((material)=>(
                      <p key={material.id} className="mt-1 text-xs text-slate-700">
                        {material.item} — {material.required_quantity} {material.unit} · {material.status}
                      </p>
                    ))}
                  </div>
                )}
                {plan.instructions && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{plan.instructions}</p>}
                {data.can_approve && plan.status!=='superseded' && (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    <label className="block text-xs font-bold text-slate-800">
                      Manager review note
                      <input className={field} minLength={12} maxLength={2500}
                        value={reviewNotes[plan.id]??''} placeholder="Instructions, reasons and review evidence"
                        onChange={(event)=>setReviewNotes((old)=>({...old,[plan.id]:event.target.value}))} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(['approved','changes_requested','withdrawn'] as const).map((decision)=>(
                        <button type="button" key={decision} className={outlined}
                          disabled={pending||(reviewNotes[plan.id]??'').trim().length<12}
                          onClick={()=>run(()=>reviewConstructionTomorrowPlan(projectId,plan.id,decision,reviewNotes[plan.id]??''))}>
                          {decision==='approved'?'Approve work':decision==='changes_requested'?'Request changes':'Withdraw approval'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {notice && <p role="status" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">{notice}</p>}
    </section>
  );
}
