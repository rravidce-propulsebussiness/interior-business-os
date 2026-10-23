'use client';
import {useActionState,useState} from 'react';
import {useRouter} from 'next/navigation';
import {saveProjectItemSchedule} from './[id]/site/stage-schedule-actions';
export type ProjectItemScheduleRow={
 stageId:string;kind:'work'|'check'|'test'|'qc'|'material';index:number;
 title:string;plannedStart:string;plannedFinish:string;note:string;version:number;
};
type Props={
 projectId:string;stageId:string;kind:ProjectItemScheduleRow['kind'];
 index:number;title:string;item?:ProjectItemScheduleRow|undefined;canPlan:boolean;
 planningMode?:'full'|'daily';today?:string;
};
const readable=(date:string)=>{
 if(!date)return '';
 const [y,m,d]=date.split('-');
 return d&&m&&y?d+'/'+m+'/'+y:date;
};
/** One date editor per canonical stage item; no second progress checklist. */
export function ProjectItemSchedule({projectId,stageId,kind,index,title,item,canPlan,planningMode='full',today}:Props){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [currentVersion,setCurrentVersion]=useState(item?.version??0);
 const [start,setStart]=useState(item?.plannedStart??'');
 const [finish,setFinish]=useState(item?.plannedFinish??'');
 const [note,setNote]=useState(item?.note??'');
 const tomorrow=today?new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10):undefined;
 const minimum=planningMode==='daily'?today:undefined;
 const maximum=planningMode==='daily'?tomorrow:undefined;
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
   {item||start&&finish?<span>Planned: {readable(start)} – {readable(finish)}</span>:
    <span>Dates not planned</span>}
   {canPlan&&<button type="button" onClick={()=>setOpen(value=>!value)}
    aria-expanded={open} className="pv2-item-schedule-toggle">
    {open?'Close dates':item?'Edit dates':'Plan dates'}</button>}
  </div>
  {open&&canPlan&&<form action={submit} className="pv2-item-schedule-form">
   <p className="pv2-hint">{planningMode==='daily'?'Site engineers can plan today or tomorrow only. For long-term schedules, contact the owner or project manager.':'Owners/project managers may plan future work. Company stage order is managed in Settings → Payment Settings.'}</p>
   <div className="pv2-item-schedule-dates">
    <label>Planned start<input type="date" name="planned_start" required
     min={minimum} max={maximum} value={start} onChange={event=>setStart(event.target.value)}/></label>
    <label>Planned finish<input type="date" name="planned_finish" required
     min={start||minimum} max={maximum} value={finish} onChange={event=>setFinish(event.target.value)}/></label>
   </div>
   <label>Planning note (optional)<input type="text" name="note" maxLength={500}
    value={note} onChange={event=>setNote(event.target.value)}
    placeholder="Sequence, assignee, or expected site access"/></label>
   <p className="pv2-hint">Overlapping and same-day plans are allowed. This does not start work, approve QC or mark payment received.</p>
   <button type="submit" className="pv2-button pv2-primary" disabled={pending||!start||!finish||finish<start||Boolean(minimum&&(start<minimum||finish<minimum))||Boolean(maximum&&(start>maximum||finish>maximum))}>
    {pending?'Saving dates…':'Save planned dates'}</button>
  </form>}
  {result.message&&<p role="status" className={'pv2-form-feedback '+(result.saved?'good':'bad')}>{result.message}</p>}
 </div>;
}
