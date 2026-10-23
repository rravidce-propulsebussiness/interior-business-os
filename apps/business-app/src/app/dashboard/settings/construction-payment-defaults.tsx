'use client';

import {useActionState,useState} from 'react';
import {inferCompanyWorkAreaCode,type CompanyConstructionPaymentRow,type CompanyWorkStep} from '@business-os/core/company-construction-defaults';
import {saveConstructionPaymentDefaults} from './payment-default-actions';

type Kind=CompanyWorkStep['kind'];
const labels:Record<Kind,string>={
 work:'Work',material:'Material',check:'Site check',test:'Test',qc:'Company QC',
};
const descriptions:Record<Kind,string>={
 work:'Work',material:'Materials',check:'Checks',test:'Tests',qc:'QC',
};
const kinds:Kind[]=['work','material','check','test','qc'];
const isCheck=(step:CompanyWorkStep)=>step.kind==='check'||step.kind==='test';
const link=(step:CompanyWorkStep)=>step.area+'|'+step.name.toLowerCase();

function ItemIcon({kind}:{kind:Kind}) {
 const shape=kind==='work'?<><path d="M4 17h16M5 15a7 7 0 0 1 14 0M9 15V8M15 15V8M3 17v3h18v-3"/></>:
  kind==='material'?<><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></>:
  kind==='check'?<><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2m-7 9 2 2 5-5"/></>:
  kind==='test'?<><path d="M9 3h6m-5 0v7L5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2l-5-9V3M8 16h8"/></>:
  <><path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>;
 return <svg className="us-payment-kind-icon" xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}
function ActionIcon({action}:{action:'up'|'down'|'edit'|'delete'}) {
 if(action==='up')return <span aria-hidden="true">↑</span>;
 if(action==='down')return <span aria-hidden="true">↓</span>;
 return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {action==='edit'?<><path d="m14 5 5 5M4 20l4.5-1 11-11a2 2 0 0 0-5-5l-11 11L4 20Z"/></>:
   <><path d="M4 7h16M10 4h4m-8 3 1 14h10l1-14M10 11v6m4-6v6"/></>}
 </svg>;
}

function DefaultPaymentStage({row,index,canEdit,expanded,onToggle,onChange,onRemove}:{
 row:CompanyConstructionPaymentRow;index:number;canEdit:boolean;expanded:boolean;
 onToggle:()=>void;onChange:(next:CompanyConstructionPaymentRow)=>void;onRemove:()=>void;
}) {
 const steps=row.steps??[];
 const areas=row.areas?.length?row.areas:[...new Set(steps.map(item=>item.area))];
 const [kind,setKind]=useState<Kind>('work');
 const [name,setName]=useState('');
 const [checkRef,setCheckRef]=useState('');
 const [error,setError]=useState('');
 const [after,setAfter]=useState<number|null>(null);
 const [showAll,setShowAll]=useState(false);
 const [editing,setEditing]=useState<number|null>(null);
 const [editDraft,setEditDraft]=useState('');
 const prior=steps.slice(0,after===null?steps.length:after+1).filter(isCheck);
 const current=checkRef?prior.find(x=>link(x)===checkRef):prior.at(-1);
 const counts=kinds.map(type=>({type,count:steps.filter(item=>item.kind===type).length}));
 const limit=6;
 const visible=showAll?steps:steps.slice(0,limit);

 // Preserve the internal project stage mapping, without asking users to
 // repeatedly select PRECONSTRUCTION / DESIGN / FOUNDATION for every work item.
 const workAreaFor=(title:string,position:number):string|null=>{
  const inferred=inferCompanyWorkAreaCode(title);
  if(inferred&&areas.includes(inferred))return inferred;
  if(inferred&&!areas.length)return inferred;
  if(inferred&&!areas.includes(inferred))return null;
  return steps[position]?.area??steps[position+1]?.area??areas[0]??inferCompanyWorkAreaCode(row.name);
 };
 const editRows=(next:CompanyWorkStep[])=>{onChange({...row,steps:next});setError('');};
 const add=(position:number)=>{
  setAfter(position);setName('');setKind('work');setCheckRef('');setError('');
 };
 const save=()=>{
  const title=kind==='qc'?current?.name:name.trim().replace(/\s+/g,' ');
  if(!title||title.length<2||title.length>180){
   setError('Enter a work, material or check name; for QC choose the earlier site check.');return;
  }
  if((kind==='check'||kind==='test')&&title.length<3){
   setError('Enter a descriptive site check or test name.');return;
  }
  if(kind==='qc'&&!current){
   setError('First add a site check or test, then select it for company QC.');return;
  }
  const chosen=kind==='qc'?current!.area:workAreaFor(title,after??steps.length-1);
  if(!chosen){
   setError('This work belongs to another construction stage. Add it under the corresponding payment milestone.');return;
  }
  const next:CompanyWorkStep={kind,name:title,area:chosen};
  if(steps.some(item=>item.area===next.area&&item.name.toLowerCase()===next.name.toLowerCase()&&
   (item.kind===next.kind||(isCheck(item)&&isCheck(next))))){
   setError('This item already exists in the payment stage.');return;
  }
  const updated=[...steps];updated.splice((after??steps.length-1)+1,0,next);
  onChange({...row,steps:updated,areas:areas.includes(chosen)?row.areas:[...areas,chosen]});
  if(updated.length>limit)setShowAll(true);
  setError('');setAfter(null);setName('');setCheckRef('');
 };
 const startEdit=(position:number)=>{
  setEditing(position);setEditDraft(steps[position]?.name??'');setError('');
 };
 const saveEdit=()=>{
  if(editing===null)return;
  const item=steps[editing];
  if(!item||item.kind==='qc')return;
  const name=editDraft.trim().replace(/\s+/g,' ');
  if(name.length<(isCheck(item)?3:2)||name.length>180){
   setError('Enter a descriptive item name, up to 180 characters.');return;
  }
  if(steps.some((other,i)=>i!==editing&&other.area===item.area&&
    other.name.toLowerCase()===name.toLowerCase()&&
    (other.kind===item.kind||(isCheck(item)&&isCheck(other))))){
   setError('An item with this name is already included.');return;
  }
  const updated=steps.map((other,i)=>{
   if(i===editing)return {...other,name};
   if(isCheck(item)&&other.kind==='qc'&&other.area===item.area&&other.name===item.name)
    return {...other,name};
   return other;
  });
  editRows(updated);setEditing(null);setEditDraft('');
 };
 const removeStep=(position:number)=>{
  const item=steps[position];
  if(!item)return;
  // Deletion stays a local template edit until the company form is saved.
  const updated=steps.filter((other,i)=>i!==position&&
   !(isCheck(item)&&other.kind==='qc'&&link(other)===link(item)));
  editRows(updated);setEditing(null);
 };
 const move=(position:number,direction:number)=>{
  const destination=position+direction;
  if(destination<0||destination>=steps.length)return;
  const updated=[...steps];[updated[position],updated[destination]]=[updated[destination]!,updated[position]!];
  if(updated.some((item,i)=>item.kind==='qc'&&!updated.slice(0,i).some(earlier=>
   isCheck(earlier)&&link(earlier)===link(item)))){
   setError('Company QC must remain after its linked site check/test.');return;
  }
  editRows(updated);setEditing(null);
 };
 return <li className={'us-payment-stage'+(expanded?' is-expanded':'')}>
  <button className="us-payment-stage-toggle" type="button" onClick={()=>{
   if(expanded){setShowAll(false);setEditing(null);setAfter(null);}
   onToggle();
  }} aria-expanded={expanded} aria-controls={'company-payment-stage-'+index}>
   <span className="us-payment-default-index">{index+1}</span>
   <span className="us-payment-heading-copy">
    <strong>{row.name||'Untitled payment milestone'}</strong>
    <small>{steps.length} included items · editable company template</small>
   </span>
   <span className="us-payment-heading-percent"><b>{Number(row.percent||0).toLocaleString(undefined,{maximumFractionDigits:2})}%</b>
    <small>of total value</small></span>
   <span className={'us-payment-chevron'+(expanded?' is-up':'')} aria-hidden="true">⌄</span>
  </button>
  <div className="us-payment-stage-stats" aria-label={'Included item counts for stage '+(index+1)}>
   {counts.map(({type,count})=><span className={'us-payment-stat is-'+type} key={type}>
    <ItemIcon kind={type}/><strong>{count}</strong><small>{descriptions[type]}</small>
   </span>)}
  </div>
  {expanded&&<div id={'company-payment-stage-'+index} className="us-payment-stage-content">
   <div className="us-payment-stage-fields">
    <label>Milestone name
     <input value={row.name} maxLength={100} required disabled={!canEdit}
      aria-label={'Default milestone '+(index+1)}
      onChange={e=>onChange({...row,name:e.target.value})}/>
    </label>
    <label>Percentage
     <span className="us-payment-default-percent">
      <input type="number" inputMode="decimal" min="0.01" max="100" step="0.01"
       value={row.percent||''} required disabled={!canEdit}
       aria-label={'Default percentage '+(index+1)}
       onChange={e=>onChange({...row,percent:Number(e.target.value)})}/> %
     </span>
    </label>
    {canEdit&&<button type="button" className="us-payment-remove" onClick={onRemove}>
     Remove stage
    </button>}
   </div>
   <p className="us-payment-note">
    These items define the scope of this payment stage. Edit the order here, or
    customize a new quotation separately without changing your company defaults.
   </p>
   <div className="us-payment-items-heading">
    <strong>Items in this stage</strong>
    {steps.length>limit&&<button className="us-payment-step-expand" type="button"
     aria-expanded={showAll} aria-controls={'company-payment-items-'+index}
     onClick={()=>{setShowAll(value=>!value);setEditing(null);setAfter(null);}}>
     {showAll?'Show fewer items':'Show all '+steps.length+' items'}
     <span aria-hidden="true">{showAll?'⌃':'⌄'}</span>
    </button>}
   </div>
   <div id={'company-payment-items-'+index} className="us-payment-step-list">
    {visible.map((item,position)=><div key={position} className="us-payment-step">
     <span className="us-payment-step-number">{position+1}</span>
     <span className={'us-payment-step-kind is-'+item.kind}><ItemIcon kind={item.kind}/>
      <small>{labels[item.kind]}</small>
     </span>
     <div className="us-payment-step-name">
      {editing===position?
       <div className="us-payment-step-edit-form">
        <input autoFocus value={editDraft} maxLength={180}
         aria-label={'Edit '+labels[item.kind]+' '+(position+1)}
         onChange={e=>setEditDraft(e.target.value)}
         onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveEdit();}}}/>
        <button type="button" onClick={saveEdit}>Save</button>
        <button type="button" onClick={()=>{setEditing(null);setError('');}}>Cancel</button>
       </div>:
       <span>{item.name}</span>}
     </div>
     {canEdit&&<div className="us-payment-step-actions">
      <button type="button" aria-label={'Move step '+(position+1)+' up'} title="Move up"
       onClick={()=>move(position,-1)} disabled={position===0}><ActionIcon action="up"/></button>
      <button type="button" aria-label={'Move step '+(position+1)+' down'} title="Move down"
       onClick={()=>move(position,1)} disabled={position===steps.length-1}><ActionIcon action="down"/></button>
      <button type="button" aria-label={'Edit step '+(position+1)} title="Edit item"
       disabled={item.kind==='qc'} onClick={()=>startEdit(position)}><ActionIcon action="edit"/></button>
      <button type="button" aria-label={'Delete step '+(position+1)} title="Delete item"
       className="us-payment-step-delete" onClick={()=>removeStep(position)}><ActionIcon action="delete"/></button>
     </div>}
    </div>)}
    {!steps.length&&<p className="us-payment-empty">No steps yet. Add the first work item below.</p>}
   </div>
   {canEdit&&<button type="button" className="us-payment-add-work"
    onClick={()=>add(steps.length-1)}>＋ Add work, material or check</button>}
   {canEdit&&after!==null&&<div className="us-payment-step-form">
    <label>Type of item
     <select aria-label="New default step type" value={kind}
      onChange={e=>{setKind(e.target.value as Kind);setCheckRef('');}}>
      <option value="work">Work</option>
      <option value="material">Material required</option>
      <option value="check">Site check</option>
      <option value="test">Test</option>
      <option value="qc">Company QC</option>
     </select>
    </label>
    {kind==='qc'?<label>QC for which earlier site check/test?
     <select value={current?link(current):''} onChange={e=>setCheckRef(e.target.value)}
      aria-label="QC linked site check">
      {prior.length===0&&<option value="">Add site check first</option>}
      {prior.map(item=><option key={link(item)} value={link(item)}>{item.name}</option>)}
     </select>
    </label>:
     <label>Item name
      <input autoFocus value={name} maxLength={180} placeholder="e.g. Footing bar bending"
       aria-label="New default work item name" onChange={e=>setName(e.target.value)}/>
     </label>}
    <div className="us-payment-step-form-actions">
     <button type="button" className="us-payment-save-item" onClick={save}>Add {labels[kind]}</button>
     <button type="button" onClick={()=>{setAfter(null);setError('');}}>Cancel</button>
    </div>
   </div>}
   {error&&<p role="alert" className="us-payment-error">{error}</p>}
  </div>}
 </li>;
}

export function ConstructionPaymentDefaults({initial,canEdit}:{
 initial:CompanyConstructionPaymentRow[];canEdit:boolean;
}) {
 const [rows,setRows]=useState<CompanyConstructionPaymentRow[]>(initial.map(item=>({
  ...item,areas:[...(item.areas??[])],steps:[...(item.steps??[])],
 })));
 const [expandedIndex,setExpandedIndex]=useState<number|null>(0);
 const [state,action,pending]=useActionState(saveConstructionPaymentDefaults,{saved:false,message:''});
 const total=rows.reduce((sum,row)=>sum+(Number(row.percent)||0),0);
 const update=(index:number,next:CompanyConstructionPaymentRow)=>{
  setRows(previous=>previous.map((row,i)=>i===index?next:row));
 };
 const remove=(index:number)=>{
  setRows(previous=>previous.filter((_,i)=>i!==index));
  setExpandedIndex(value=>value===null?null:value===index?null:value>index?value-1:value);
 };
 return <div className="us-payment-defaults">
  <p className="us-info">Each payment stage includes its work, materials, checks, tests and company QC.
   These defaults are copied into new construction quotations and can be customized per project.</p>
  <form action={action}>
   <input type="hidden" name="rows" value={JSON.stringify(rows)}/>
   <ol className="us-payment-default-list">
    {rows.map((row,index)=><DefaultPaymentStage key={index} row={row} index={index}
     expanded={expandedIndex===index} onToggle={()=>
      setExpandedIndex(value=>value===index?null:index)}
     canEdit={canEdit} onChange={next=>update(index,next)} onRemove={()=>remove(index)}/>)}
   </ol>
   {canEdit&&<button type="button" className="us-payment-add" disabled={rows.length>=40}
    onClick={()=>{setRows(previous=>[...previous,{name:'New construction milestone',percent:0,areas:[],steps:[]}]);
     setExpandedIndex(rows.length);}}>
    ＋ Add payment stage
   </button>}
   <div className="us-payment-default-footer">
    <strong>Total: {total.toFixed(2)}%</strong>
    {canEdit&&<button type="submit" className="us-save" disabled={pending||
     Math.abs(total-100)>0.001||!rows.length||rows.some(row=>!row.name.trim()||row.percent<=0)}>
     {pending?'Saving…':'Save company payments & work'}
    </button>}
   </div>
   {state.message&&<p role="status" className={state.saved?'us-info':'us-payment-error'}>{state.message}</p>}
  </form>
 </div>;
}
