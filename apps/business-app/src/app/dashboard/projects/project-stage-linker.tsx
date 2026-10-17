'use client';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { linkConstructionStageRecord } from './[id]/site/stage-record-actions';

export type StageLinkOption={kind:'report'|'material'|'check'|'media';id:string;title:string};
type Outcome={saved:boolean;message:string};
export function ProjectStageLinker({projectId,stageId,options}:{
 projectId:string;stageId:string;options:StageLinkOption[];
}){
 const router=useRouter();
 const [state,submit,pending]=useActionState(async(_previous:Outcome,form:FormData)=>{
  const choice=String(form.get('record')??'');
  const option=options.find(row=>row.kind+':'+row.id===choice);
  if(!option)return {saved:false,message:'Select an existing project record.'};
  const result=await linkConstructionStageRecord(projectId,stageId,option.kind,option.id);
  if(result.saved)router.refresh();
  return result;
 },{saved:false,message:''});
 if(!options.length)return null;
 return <details className="pv2-stage-associate">
  <summary>Link existing report, material request, photo or check to this stage</summary>
  <form action={submit} className="pv2-stage-associate-form">
   <label>Project evidence
    <select required name="record" defaultValue="">
     <option value="" disabled>Select recorded site activity</option>
     {options.map(r=><option key={r.kind+':'+r.id} value={r.kind+':'+r.id}>
      {r.kind.toUpperCase()} · {r.title.slice(0,100)}
     </option>)}
    </select>
   </label>
   <button type="submit" disabled={pending} className="pv2-button pv2-outline">
    {pending?'Linking…':'Attach existing record'}
   </button>
   {state.message&&<p role="status" className={'pv2-form-feedback '+(state.saved?'good':'bad')}>{state.message}</p>}
  </form>
 </details>;
}
