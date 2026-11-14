'use client';
import {useActionState,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {saveProjectItemSchedule} from './[id]/site/stage-schedule-actions';
import {offsetPlanDate} from './project-schedule-dates';
export type ProjectItemScheduleRow={
 stageId:string;kind:'work'|'check'|'test'|'qc'|'material';index:number;
 title:string;plannedStart:string;plannedFinish:string;note:string;version:number;
};
type Props={
 projectId:string;stageId:string;kind:ProjectItemScheduleRow['kind'];
 index:number;title:string;item?:ProjectItemScheduleRow|undefined;canPlan:boolean;
 planningMode?:'full'|'site'|undefined;today?:string|undefined;
 baselineStart?:string|undefined;baselineFinish?:string|undefined;
};
const readable=(date:string)=>{
 if(!date)return '';
 const [y,m,d]=date.split('-');
 return d&&m&&y?d+'/'+m+'/'+y:date;
};
/** One date editor per canonical stage item; no second progress checklist. */
export function ProjectItemSchedule({projectId,stageId,kind,index,title,item,canPlan,planningMode='full',today='',baselineStart='',baselineFinish=''}:Props){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [currentVersion,setCurrentVersion]=useState(item?.version??0);
 const [start,setStart]=useState(item?.plannedStart||baselineStart);
 const [finish,setFinish]=useState(item?.plannedFinish||baselineFinish);
 const [note,setNote]=useState(item?.note??'');
 const hasSavedRange=Boolean(item?.plannedStart&&item?.plannedFinish);
 const hasBaseline=Boolean(baselineStart&&baselineFinish);
 // Refresh this editor when another user updates the stage schedule.
 useEffect(()=>{
  if(open)return;
  setCurrentVersion(item?.version??0);
  setStart(item?.plannedStart||baselineStart);
  setFinish(item?.plannedFinish||baselineFinish);
  setNote(item?.note??'');
 },[item?.version,item?.plannedStart,item?.plannedFinish,item?.note,baselineStart,baselineFinish,open]);
 const [result,submit,pending]=useActionState(async(_previous:{saved:boolean;message:string},form:FormData)=>{
  const saved=await saveProjectItemSchedule({
   projectId,stageId,kind,index,title,version:currentVersion,
  },form);
  if(saved.saved){
   setCurrentVersion(saved.version??currentVersion+1);
   setOpen(false);
   router.refresh();
  }
  return {saved:saved.saved,message:saved.message};
 },{saved:false,message:''});
 return <div className="pv2-item-schedule">
  <div className="pv2-item-schedule-current">
   <span aria-hidden="true">▦</span>
   {hasSavedRange?<span><b>Current plan</b> {readable(item!.plannedStart)} – {readable(item!.plannedFinish)}
     {hasBaseline&&<small className="pv2-item-schedule-baseline">Baseline {readable(baselineStart)} – {readable(baselineFinish)}</small>}</span>:
    hasBaseline?<span><b>Auto baseline</b> {readable(baselineStart)} – {readable(baselineFinish)}</span>:
    <span>Dates not planned</span>}
   {canPlan&&<button type="button" onClick={()=>setOpen(value=>!value)}
    aria-expanded={open} className="pv2-item-schedule-toggle">
    {open?'Close dates':hasSavedRange?'Adjust dates':hasBaseline?'Adjust schedule':'Plan dates'}</button>}
  </div>
  {open&&canPlan&&<form action={submit} className="pv2-item-schedule-form">
   {today&&<div className="pv2-item-schedule-shortcuts" aria-label="Quick planned dates">
    <span>Quick plan</span>
    <button type="button" onClick={()=>{setStart(today);setFinish(today);}}>
     Today</button>
    <button type="button" onClick={()=>{const tomorrow=offsetPlanDate(today,1);setStart(tomorrow);setFinish(tomorrow);}}>
     Tomorrow</button>
    <button type="button" onClick={()=>{setStart(today);setFinish(offsetPlanDate(today,6));}}>
     Next 7 days</button>
   </div>}
   <p className="pv2-hint">{planningMode==='site'?'Site engineers may adjust current and upcoming work dates. Starting work still requires the project’s approvals and safety checks.':'Owners and project managers may adjust the current plan.'} The auto baseline stays tied to the project creation date.</p>
   <div className="pv2-item-schedule-dates">
    <label>Planned start<input type="date" name="planned_start" required
     value={start} onChange={event=>setStart(event.target.value)}/></label>
    <label>Planned finish<input type="date" name="planned_finish" required
     min={start||undefined} value={finish} onChange={event=>setFinish(event.target.value)}/></label>
   </div>
   <label>Planning note (optional)<input type="text" name="note" maxLength={500}
    value={note} onChange={event=>setNote(event.target.value)}
    placeholder="Sequence, assignee, or expected site access"/></label>
   <p className="pv2-hint">Overlapping and same-day plans are allowed. This does not start work, approve QC or mark payment received.</p>
   <button type="submit" className="pv2-button pv2-primary" disabled={pending||!start||!finish||finish<start}>
    {pending?'Saving dates…':'Save planned dates'}</button>
  </form>}
  {result.message&&<p role="status" className={'pv2-form-feedback '+(result.saved?'good':'bad')}>{result.message}</p>}
 </div>;
}
