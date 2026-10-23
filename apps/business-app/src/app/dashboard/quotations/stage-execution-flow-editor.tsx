'use client';

import { useState } from 'react';
import {
 defaultStageRequirements,deleteStageExecutionStep,stageExecutionFlow,
 type StageFlowStep,type StageRequirements,
} from '@business-os/core/quotation-stage-requirements';
import { milestoneConstructionStages } from '@business-os/core/construction-payment-schedule';

type Kind=StageFlowStep['kind'];
type PaymentOption={index:number;name:string;percent:string};
const labels:Record<Kind,string>={
 work:'Work',material:'Material',check:'Site check',test:'Test',qc:'Company QC',payment:'Payment',
};
const isFieldCheck=(kind:Kind)=>kind==='check'||kind==='test';

/** One ordered view over canonical work, checks, and the existing payment plan.
 * Payment here only points to Finance; it never creates an invoice or receipt. */
export function StageExecutionFlowEditor({value,editable,onChange,code,payments=[]}:{
 value:StageRequirements;editable:boolean;onChange:(next:StageRequirements)=>void;
 code:string;payments?:PaymentOption[];
}){
 const steps=stageExecutionFlow(value);
 const [insertAfter,setInsertAfter]=useState<number|null>(null);
 const [editing,setEditing]=useState<number|null>(null);
 const [kind,setKind]=useState<Kind>('check');
 const [title,setTitle]=useState('');
 const [qcIndex,setQcIndex]=useState('0');
 const [paymentIndex,setPaymentIndex]=useState('0');
 const [source,setSource]=useState<'existing'|'new'>('existing');
 const [existingIndex,setExistingIndex]=useState('0');
 const [error,setError]=useState('');
 const template=milestoneConstructionStages().find(x=>x.code===code.split('/')[0]);
 const requiredChecks=template?.holdPoint==='structural'?defaultStageRequirements(code).checks:[];
 const selectedPayments=payments.filter(row=>!steps.some(step=>step.kind==='payment'&&step.index===row.index));
 const commit=(next:StageRequirements)=>{onChange(next);setError('');};
 const labelOf=(step:StageFlowStep)=>step.kind==='payment'
  ?payments.find(row=>row.index===step.index)?.name??'Unlinked payment milestone'
  :value[step.kind==='work'?'work':'checks'][step.index]??'Missing step';
 const checkBefore=(flow:StageFlowStep[])=>flow.every((item,i)=>item.kind!=='qc'||
  flow.slice(0,i).some(previous=>isFieldCheck(previous.kind)&&previous.index===item.index));
 const openInsert=(position:number)=>{
  setInsertAfter(position);setEditing(null);setKind('check');
  setSource('existing');setTitle('');setExistingIndex('0');setError('');
  setPaymentIndex(String(selectedPayments[0]?.index??0));setQcIndex('0');
 };
 const openEdit=(position:number)=>{
  const step=steps[position];if(!step)return;
  setEditing(position);setInsertAfter(null);setTitle(labelOf(step));setError('');
  if(step.kind==='payment')setPaymentIndex(String(step.index));
  if(step.kind==='qc')setQcIndex(String(step.index));
 };
 const move=(position:number,direction:number)=>{
  const next=[...steps];const other=position+direction;
  if(other<0||other>=next.length)return;
  [next[position],next[other]]=[next[other]!,next[position]!];
  if(!checkBefore(next)){setError('A site check/test must remain before its QC review.');return;}
  commit({...value,flow:next});
 };
 const insert=(after:number)=>{
  const flow=[...steps];
  const trimmed=title.replace(/\s+/g,' ').trim();
  let work=[...value.work],checks=[...value.checks];
  if(kind==='payment'){
   const index=Number(paymentIndex);
   if(!payments.some(row=>row.index===index)||flow.some(row=>row.kind==='payment'&&row.index===index)){
    setError('Choose a linked milestone that is not already in this stage.');return;
   }
   flow.splice(after+1,0,{kind:'payment',index});
  }else if(kind==='qc'){
   const index=Number(qcIndex);
   if(!Number.isInteger(index)||index<0||index>=checks.length||
    flow.some(row=>row.kind==='qc'&&row.index===index)){
    setError('Choose one site check that does not already have QC.');return;
   }
   const checkPosition=flow.findIndex(row=>isFieldCheck(row.kind)&&row.index===index);
   if(checkPosition<0){setError('Select a site check before adding QC.');return;}
   // Move the referenced check forward when necessary; never duplicate it.
   if(checkPosition>after){
    const [check]=flow.splice(checkPosition,1);
    flow.splice(after+1,0,check!);
   }
   const updatedCheck=flow.findIndex(row=>isFieldCheck(row.kind)&&row.index===index);
   flow.splice(Math.max(after+1,updatedCheck+1),0,{kind:'qc',index});
  }else{
   const field=kind==='work'?work:checks;
   if(source==='existing'&&field.length>0){
    const index=Number(existingIndex);
    if(!Number.isInteger(index)||index<0||index>=field.length){
     setError('Choose an existing work or check.');return;
    }
    const from=flow.findIndex(step=>step.index===index&&
     (kind==='work'?step.kind==='work':isFieldCheck(step.kind)));
    if(from<0){setError('Item is not in the execution sequence.');return;}
    const [selected]=flow.splice(from,1);
    const position=from<=after?after:after+1;
    flow.splice(position,0,{...selected!,kind});
   }else{
    const minimum=kind==='work'?2:3;
    if(trimmed.length<minimum||trimmed.length>180||field.length>=50){
     setError('Enter a valid new item name, up to 180 characters.');return;
    }
    if(field.some(s=>s.toLowerCase()===trimmed.toLowerCase())){
     setError('Already selected. Move the existing item instead.');return;
    }
    flow.splice(after+1,0,{kind,index:field.length});
    field.push(trimmed);
   }
  }
  if(flow.length>150||!checkBefore(flow)){
   setError('Keep every site check before its company QC. Maximum 150 steps.');return;
  }
  commit({...value,work,checks,flow});
  setInsertAfter(null);setTitle('');
 };
 const saveEdit=(position:number)=>{
  const step=steps[position];if(!step)return;
  let next:StageRequirements;
  if(step.kind==='payment'||step.kind==='qc'){
   const index=Number(step.kind==='payment'?paymentIndex:qcIndex);
   if(step.kind==='payment'&&!payments.some(row=>row.index===index)){
    setError('Select a payment milestone linked to this stage.');return;
   }
   if(step.kind==='qc'){
    const earlier=steps.slice(0,position).some(row=>isFieldCheck(row.kind)&&row.index===index);
    if(!earlier){setError('First place the matching site check above this QC.');return;}
   }
   if(steps.some((row,i)=>i!==position&&row.kind===step.kind&&row.index===index)){
    setError('This payment or QC review is already in the sequence.');return;
   }
   next={...value,flow:steps.map((row,i)=>i===position?{...row,index}:row)};
  }else{
   const field=step.kind==='work'?'work':'checks';
   const normalized=title.replace(/\s+/g,' ').trim();
   const min=field==='work'?2:3;
   if(normalized.length<min||normalized.length>180){
    setError('Item name must be '+min+'–180 characters long.');return;
   }
   if(field==='checks'&&requiredChecks.includes(value.checks[step.index]??'')){
    setError('Mandatory structural check names cannot be changed.');return;
   }
   if(value[field].some((name,i)=>i!==step.index&&name.toLowerCase()===normalized.toLowerCase())){
    setError('An item with this name already exists.');return;
   }
   const entries=[...value[field]];entries[step.index]=normalized;
   next={...value,[field]:entries};
  }
  commit(next);setEditing(null);
 };
 const deleteItem=(position:number)=>{
  const step=steps[position];if(!step)return;
  const name=labelOf(step);
  const confirmText=step.kind==='payment'
   ?'Remove "'+name+'" from this execution order? The quotation payment schedule will stay unchanged.'
   :isFieldCheck(step.kind)
   ?'Delete "'+name+'" from the selected site checks and the execution order? Its linked QC step, if any, will also be removed.'
   :step.kind==='qc'
   ?'Remove this QC checkpoint from the sequence? The original site check remains.'
   :'Delete "'+name+'" from the selected work and the execution order?';
  if(!window.confirm(confirmText))return;
  try{commit(deleteStageExecutionStep(value,position,code));setEditing(null);setInsertAfter(null);}
  catch(e){setError(e instanceof Error?e.message:'Unable to delete this step.');}
 };
 return <section className="qs-stage-flow-editor" aria-label="Ordered work, payment and quality flow">
  <div className="qs-stage-flow-heading">
   <strong>Execution order</strong>
   <small>Work → site check / test → company QC → payment → next work, as needed</small>
  </div>
  <p className="qs-stage-flow-info">
   Arrange each site step. Payment uses an existing quotation milestone and remains
   recorded in Finance. Site checks and company QC remain separately evidenced.
  </p>
  <ol className="qs-stage-flow-list">
   {steps.map((step,i)=>{
    const name=labelOf(step);
    const isProtected=isFieldCheck(step.kind)&&requiredChecks.includes(value.checks[step.index]??'');
    const activeEdit=editing===i;
    return <li key={step.kind+'-'+step.index} className="qs-stage-flow-item">
     <span className="qs-stage-flow-position">{i+1}</span>
     <div className="qs-stage-flow-copy">
      <span className={'qs-stage-flow-kind is-'+step.kind}>{labels[step.kind]}</span>
      {activeEdit?<div className="qs-stage-flow-new qs-stage-flow-inline-edit">
       {step.kind==='payment'?<label>Linked payment milestone
        <select value={paymentIndex} onChange={e=>setPaymentIndex(e.target.value)}>
         {payments.map(row=><option value={row.index} key={row.index}>{row.name} · {row.percent}%</option>)}
        </select></label>:step.kind==='qc'?<label>Company QC for site check/test
        <select value={qcIndex} onChange={e=>setQcIndex(e.target.value)}>
         {value.checks.map((name,index)=><option key={index} value={index}>{name}</option>)}
        </select></label>:<label>Edit {labels[step.kind].toLowerCase()}
        <input value={title} maxLength={180} onChange={e=>setTitle(e.target.value)}
         onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveEdit(i);}}}/>
        </label>}
       {error&&<p className="qs-stage-flow-error" role="alert">{error}</p>}
       <div className="qs-stage-flow-buttons">
        <button type="button" onClick={()=>saveEdit(i)}>Save changes</button>
        <button type="button" onClick={()=>{setEditing(null);setError('');}}>Cancel</button>
       </div>
      </div>:<>
       <strong>{name}</strong>
       {step.kind==='payment'&&<small>{
        payments.find(row=>row.index===step.index)?.percent??'—'
       }% · Linked to the payment schedule; payment status is managed in Finance</small>}
       {step.kind==='qc'&&<small>Site visit and separate QC Pass/Fail required</small>}
       {isProtected&&<small>Mandatory structural check</small>}
      </>}
     </div>
     {editable&&!activeEdit&&<div className="qs-stage-flow-actions">
      <button type="button" disabled={i===0} aria-label={'Move '+name+' earlier'} onClick={()=>move(i,-1)}>↑</button>
      <button type="button" disabled={i===steps.length-1} aria-label={'Move '+name+' later'} onClick={()=>move(i,1)}>↓</button>
      {isFieldCheck(step.kind)&&<button type="button" onClick={()=>commit({...value,
       flow:steps.map((item,n)=>n===i?{...item,kind:item.kind==='test'?'check':'test'}:item)
      })}>{step.kind==='test'?'Mark check':'Mark test'}</button>}
      <button type="button" disabled={isProtected} title={isProtected?'Required structural check':undefined}
       aria-label={'Edit '+name} onClick={()=>openEdit(i)}>✎ Edit</button>
      <button type="button" disabled={isProtected||(step.kind==='work'&&value.work.length===1)}
       className="qs-stage-flow-delete" aria-label={'Delete '+name} onClick={()=>deleteItem(i)}>Delete</button>
      <button type="button" onClick={()=>openInsert(i)}>+ Next</button>
     </div>}
     {editable&&insertAfter===i&&<div className="qs-stage-flow-new">
      <label>Next step type
       <select value={kind} onChange={e=>{setKind(e.target.value as Kind);setError('');}}>
        <option value="work">Work</option>
        <option value="check">Site check</option>
        <option value="test">Test</option>
        <option value="qc">Company QC</option>
        <option value="payment">Payment</option>
       </select>
      </label>
      {kind==='payment'?<label>Existing quotation payment milestone
       {selectedPayments.length?<select value={paymentIndex} onChange={e=>setPaymentIndex(e.target.value)}>
        {selectedPayments.map(row=><option value={row.index} key={row.index}>{row.name} · {row.percent}%</option>)}
       </select>:<small>No unused payment milestones are linked to this construction stage.</small>}
      </label>:kind==='qc'?<label>Company QC for existing site check/test
       <select value={qcIndex} onChange={e=>setQcIndex(e.target.value)}>
        {value.checks.map((check,index)=><option value={index} key={index}>{check}</option>)}
       </select>
      </label>:<>
       <label>Use selected item or create new
        <select value={source} onChange={e=>setSource(e.target.value as 'existing'|'new')}>
         <option value="existing" disabled={!(kind==='work'?value.work:value.checks).length}>Choose existing</option>
         <option value="new">Create new</option>
        </select>
       </label>
       {source==='existing'&&(kind==='work'?value.work:value.checks).length>0?
        <label>Move this {labels[kind].toLowerCase()} here
         <select value={existingIndex} onChange={e=>setExistingIndex(e.target.value)}>
          {(kind==='work'?value.work:value.checks).map((name,index)=>
           <option value={index} key={index}>{name}</option>)}
         </select>
        </label>:<label>New {labels[kind].toLowerCase()}
         <input value={title} maxLength={180} onChange={e=>setTitle(e.target.value)}
          placeholder={kind==='work'?'e.g. Excavation':'e.g. Check excavation width and depth'}/>
        </label>}
      </>}
      {error&&<p role="alert" className="qs-stage-flow-error">{error}</p>}
      <div className="qs-stage-flow-buttons">
       <button type="button" disabled={kind==='payment'&&!selectedPayments.length||
        kind==='qc'&&!value.checks.length}
        onClick={()=>insert(i)}>{kind==='payment'?'Link payment':kind==='qc'?'Add QC':
         source==='existing'?'Move item here':'Add step'}</button>
       <button type="button" onClick={()=>{setInsertAfter(null);setError('');}}>Cancel</button>
      </div>
     </div>}
    </li>;
   })}
  </ol>
  {!editable&&<p className="qs-stage-flow-info">Create a quotation revision to edit the execution sequence.</p>}
  {editable&&insertAfter===null&&editing===null&&<button type="button"
   className="qs-stage-flow-add-end" onClick={()=>openInsert(steps.length-1)}>
   + Add step after the last item
  </button>}
  {error&&editing===null&&insertAfter===null&&<p className="qs-stage-flow-error" role="alert">{error}</p>}
 </section>;
}
