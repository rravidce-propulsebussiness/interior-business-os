'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { prepareProjectAdvanceInvoice, saveProjectSiteSurvey } from './project-next-actions';

type State={ok:boolean;message:string};
const initial:State={ok:false,message:''};

export function ProjectSiteSurvey({projectId,kind,previous=''}:{
 projectId:string;kind:'inspection'|'measurements';previous?:string;
}){
 const router=useRouter();
 const [state,run,pending]=useActionState(async(_old:State,data:FormData)=>{
  const result=await saveProjectSiteSurvey(projectId,data);
  if(result.ok)router.refresh();
  return result;
 },initial);
 return <form action={run} className="pv2-inline-work-form">
  <input name="kind" type="hidden" value={kind}/>
  <label>{kind==='inspection'?'Site inspection report':'Site measurements'}
   <textarea name="details" defaultValue={previous} minLength={20} maxLength={3000}
    required rows={3} placeholder={kind==='inspection'
     ?'Site access, plot boundaries, existing structures, ground levels, utilities, obstacles and photographs taken…'
     :'Plot length and width, corner measurements, road level, setbacks, plot levels, reference points and deviations…'}/>
  </label>
  <p>Record actual observations. Attach supporting photos under Project Documents if needed.</p>
  <button className="pv2-next-primary" type="submit" disabled={pending}>
   {pending?'Saving…':kind==='inspection'?'Complete site inspection':'Save site measurements'}
  </button>
  {state.message&&<p className={'pv2-next-feedback '+(state.ok?'success':'error')} role="status">{state.message}</p>}
 </form>;
}
export function ProjectAdvanceAction({projectId,defaultPercent=10}:{
 projectId:string;defaultPercent?:number;
}){
 const router=useRouter();
 const [state,run,pending]=useActionState(async(_old:State,data:FormData)=>{
  const result=await prepareProjectAdvanceInvoice(projectId,data);
  if(result.ok)router.refresh();
  return result;
 },initial);
 return <form className="pv2-inline-work-form pv2-advance-form" action={run}>
  <label>Advance percentage from agreed payment plan
   <span className="pv2-percent-input"><input name="percent" type="number" inputMode="decimal" required
    min="0.01" max="100" step="0.01" defaultValue={defaultPercent}/><span>%</span></span>
  </label>
  <p>Issues one proforma payment request for this signed agreement. It does not record a receipt or issue a GST tax invoice. Check the agreed percentage before issuing.</p>
  <button className="pv2-next-primary" disabled={pending} type="submit">
   {pending?'Preparing…':'Issue advance proforma'}
  </button>
  {state.message&&<p className={'pv2-next-feedback '+(state.ok?'success':'error')} role="status">{state.message}</p>}
 </form>;
}
