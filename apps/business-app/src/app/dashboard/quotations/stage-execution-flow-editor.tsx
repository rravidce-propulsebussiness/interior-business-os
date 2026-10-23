'use client';

import { useState } from 'react';
import {
 stageExecutionFlow, type StageFlowStep, type StageRequirements,
} from '@business-os/core/quotation-stage-requirements';

type Kind=StageFlowStep['kind'];
const labels:Record<Kind,string>={
 work:'Work',check:'Site check',test:'Test',qc:'Company QC',
};

/** Ordered references to the canonical work and site-check arrays.
 * QC never creates another check or marks any result as approved. */
export function StageExecutionFlowEditor({value,editable,onChange}:{
 value:StageRequirements;editable:boolean;onChange:(next:StageRequirements)=>void;
}){
 const steps=stageExecutionFlow(value);
 const [insertAfter,setInsertAfter]=useState<number|null>(null);
 const [kind,setKind]=useState<Kind>('check');
 const [title,setTitle]=useState('');
 const [qcIndex,setQcIndex]=useState('0');
 const [source,setSource]=useState<'existing'|'new'>('existing');
 const [existingIndex,setExistingIndex]=useState('0');
 const [error,setError]=useState('');
 const commit=(next:StageRequirements)=>{onChange(next);setError('');};
 const move=(index:number,direction:number)=>{
  const other=index+direction;if(other<0||other>=steps.length)return;
  const next=[...steps];[next[index],next[other]]=[next[other]!,next[index]!];
  const qcBeforeSiteCheck=next.some((item,i)=>item.kind==='qc'&&
   !next.slice(0,i).some(prev=>['check','test'].includes(prev.kind)&&prev.index===item.index));
  if(qcBeforeSiteCheck){setError('Move the site check or test before its company QC review.');return;}
  commit({...value,flow:next});
 };
 const insert=(after:number)=>{
  const trimmed=title.replace(/\s+/g,' ').trim();
  let nextWork=[...value.work],nextChecks=[...value.checks];
  const flow=[...steps];
  const candidates=kind==='work'?value.work:value.checks;
  const useExisting=source==='existing'&&kind!=='qc'&&candidates.length>0;
  if(kind==='qc'){
   if(!value.checks.length){setError('Add a site check or test before adding company QC.');return;}
   const index=Number(qcIndex);
   if(!Number.isInteger(index)||index<0||index>=nextChecks.length)return;
   if(flow.some(step=>step.kind==='qc'&&step.index===index)){
    setError('This check already has an explicitly positioned QC review.');return;
   }
   // A QC checkpoint must follow its matching field check or test. Reposition
   // the existing check before this QC if it was later in the default plan.
   const existing=flow.findIndex(step=>step.index===index&&
    (step.kind==='check'||step.kind==='test'));
   if(existing<0)return;
   const target=existing>after?after+1:after+1;
   if(existing>after){const [check]=flow.splice(existing,1);flow.splice(target,0,check!);}
   const checkPosition=flow.findIndex(step=>step.index===index&&
    (step.kind==='check'||step.kind==='test'));
   flow.splice(Math.max(after+1,checkPosition+1),0,{kind:'qc',index});
  }else if(useExisting){
   const index=Number(existingIndex);
   if(!Number.isInteger(index)||index<0||index>=candidates.length){
    setError('Select the work or check to move here.');return;
   }
   const currentPosition=flow.findIndex(step=>step.index===index&&
    (kind==='work'?step.kind==='work':['check','test'].includes(step.kind)));
   if(currentPosition<0){setError('This item is not available in the sequence.');return;}
   const [selected]=flow.splice(currentPosition,1);
   const destination=currentPosition<=after?after:after+1;
   flow.splice(destination,0,{...selected!,kind});
   if(flow.some((step,i)=>step.kind==='qc'&&
      !flow.slice(0,i).some(previous=>previous.index===step.index&&
       (previous.kind==='check'||previous.kind==='test')))){
    setError('This item has a linked QC review. Keep its check before that QC checkpoint.');
    return;
   }
  }else{
   const min=kind==='work'?2:3;
   if(trimmed.length<min||trimmed.length>180){
    setError('Enter a descriptive item name ('+min+'–180 characters).');return;
   }
   const field=kind==='work'?nextWork:nextChecks;
   if(field.some(label=>label.toLowerCase()===trimmed.toLowerCase())){
    setError('This item already exists. Move its row using the arrows instead.');return;
   }
   if(field.length>=50){setError('This stage already has 50 items in that category.');return;}
   const added:StageFlowStep={kind,index:field.length};
   field.push(trimmed);
   flow.splice(after+1,0,added);
  }
  if(flow.length>150){setError('This stage cannot have more than 150 flow steps.');return;}
  commit({...value,work:nextWork,checks:nextChecks,flow});
  setTitle('');setInsertAfter(null);
 };
 const removeQc=(index:number)=>{
  commit({...value,flow:steps.filter((_,i)=>i!==index)});
 };
 return <section className="qs-stage-flow-editor" aria-label="Ordered work and inspection flow">
  <div className="qs-stage-flow-heading">
   <strong>Execution order</strong>
   <small>Work → site check / test → company QC → next work, in any required order</small>
  </div>
  <p className="qs-stage-flow-info">
   Arrange steps in the order they should happen on site. Each check/test uses one
   site record; Company QC reviews that same check separately with on-site evidence.
   Structural approvals and final stage certification still apply.
  </p>
  <ol className="qs-stage-flow-list">
   {steps.map((step,i)=>{
    const name=step.kind==='work'?value.work[step.index]:value.checks[step.index];
    if(!name)return null;
    return <li key={step.kind+'-'+step.index} className="qs-stage-flow-item">
     <span className="qs-stage-flow-position">{i+1}</span>
     <div className="qs-stage-flow-copy">
      <span className={'qs-stage-flow-kind is-'+step.kind}>{labels[step.kind]}</span>
      <strong>{name}</strong>
      {step.kind==='qc'&&<small>Formal on-site review; does not repeat or automatically pass the site check</small>}
     </div>
     {editable&&<div className="qs-stage-flow-actions">
      <button type="button" disabled={i===0} aria-label={'Move '+name+' earlier'} onClick={()=>move(i,-1)}>↑</button>
      <button type="button" disabled={i===steps.length-1} aria-label={'Move '+name+' later'} onClick={()=>move(i,1)}>↓</button>
      {step.kind==='check'||step.kind==='test'?
       <button type="button" onClick={()=>commit({...value,flow:steps.map((x,n)=>
        n===i?{...x,kind:x.kind==='test'?'check':'test'}:x)})}>
        {step.kind==='check'?'Mark test':'Mark check'}
       </button>:null}
      {step.kind==='qc'&&<button type="button" onClick={()=>removeQc(i)}>Remove QC step</button>}
      <button type="button" onClick={()=>{
       setInsertAfter(insertAfter===i?null:i);setKind('check');setSource('existing');
       setExistingIndex('0');setTitle('');setError('');
      }}>+ Next</button>
     </div>}
     {editable&&insertAfter===i&&<div className="qs-stage-flow-new">
      <label>Next step type
       <select value={kind} onChange={e=>{setKind(e.target.value as Kind);setError('');}}>
        <option value="work">Work</option>
        <option value="check">Site check</option>
        <option value="test">Test</option>
        <option value="qc">Company QC</option>
       </select>
      </label>
      {kind!=='qc'&&<label>Choose existing item or create new
       <select value={source} onChange={e=>{setSource(e.target.value as 'existing'|'new');setError('');}}>
        <option value="existing" disabled={!(kind==='work'?value.work:value.checks).length}>Use an existing selected item</option>
        <option value="new">Create new item</option>
       </select>
      </label>}
      {kind==='qc'?<label>QC for existing site check/test
       <select value={qcIndex} onChange={e=>setQcIndex(e.target.value)}>
        {value.checks.map((check,index)=><option key={index} value={index}>{check}</option>)}
       </select>
      </label>:source==='existing'&&(kind==='work'?value.work:value.checks).length>0?
       <label>Move this {labels[kind].toLowerCase()} after the selected step
        <select value={existingIndex} onChange={e=>setExistingIndex(e.target.value)}>
         {(kind==='work'?value.work:value.checks).map((item,index)=>
          <option key={index} value={index}>{item}</option>)}
        </select>
       </label>:
       <label>New {labels[kind].toLowerCase()} item
        <input maxLength={180} value={title} onChange={e=>{setTitle(e.target.value);setError('');}}
         placeholder={kind==='work'?'e.g. Excavation':'e.g. Verify excavation depth and width'}/>
       </label>}
      {error&&<p role="alert" className="qs-stage-flow-error">{error}</p>}
      <div className="qs-stage-flow-buttons">
       <button type="button" onClick={()=>insert(i)} disabled={kind==='qc'&&!value.checks.length}>{kind==='qc'?'Add QC checkpoint':source==='existing'?'Move selected item here':'Add new step'}</button>
       <button type="button" onClick={()=>{setInsertAfter(null);setError('');}}>Cancel</button>
      </div>
     </div>}
    </li>;
   })}
  </ol>
  {!editable&&<p className="qs-stage-flow-info">Create a quotation revision to change this execution sequence.</p>}
  {editable&&insertAfter===null&&<button type="button" className="qs-stage-flow-add-end"
    onClick={()=>{setInsertAfter(steps.length-1);setKind('check');setSource('existing');setExistingIndex('0');setError('');}}>
    + Add step after the last item
   </button>}
  {error&&insertAfter===null&&<p role="alert" className="qs-stage-flow-error">{error}</p>}
 </section>;
}
