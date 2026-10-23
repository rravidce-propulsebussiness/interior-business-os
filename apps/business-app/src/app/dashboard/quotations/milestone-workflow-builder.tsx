'use client';

import {useState} from 'react';
import {defaultStageRequirements,type StageRequirementsMap} from '@business-os/core/quotation-stage-requirements';
import {suggestWorkArea,type QuotationMilestoneStep} from '@business-os/core/quotation-milestone-flow';
import {milestoneConstructionStages} from '@business-os/core/construction-payment-schedule';

type Kind=QuotationMilestoneStep['kind']|'payment';
type Props={
 paymentIndex:number;
 paymentName:string;
 steps:QuotationMilestoneStep[];
 codes:string[];
 allCodes:string[];
 plannedWorkCodes:string[];
 requirements:StageRequirementsMap;
 editable:boolean;
 onChange:(steps:QuotationMilestoneStep[],requirements:StageRequirementsMap)=>void;
 onAddPayment:()=>void;
 onLinkStage:(code:string)=>void;
};
const names:Record<Kind,string>={
 payment:'Payment',work:'Work',material:'Material',check:'Site Check',test:'Test',qc:'Company QC',
};
const label=(code:string)=>code.replaceAll('_',' ').replace('/',' · ');
const isCheck=(kind:QuotationMilestoneStep['kind'])=>kind==='check'||kind==='test';
const belongs=(step:QuotationMilestoneStep)=>step.kind==='work'?'work':
 step.kind==='material'?'materials':'checks';
const minLength=(kind:Kind)=>isCheck(kind as QuotationMilestoneStep['kind'])?3:2;

export function MilestoneWorkflowBuilder({paymentIndex,paymentName,steps,codes,allCodes,plannedCodes,plannedWorkCodes,requirements,
 editable,onChange,onAddPayment,onLinkStage}:Props){
 const [after,setAfter]=useState<number|null>(null);
 const [editing,setEditing]=useState<number|null>(null);
 const [kind,setKind]=useState<Kind>('work');
 const [code,setCode]=useState(codes[0]??'');
 const [name,setName]=useState('');
 const [choice,setChoice]=useState<'new'|'existing'>('new');
 const [existing,setExisting]=useState('0');
 const [qcPosition,setQcPosition]=useState('');
 const [error,setError]=useState('');
 const lastCode=steps[Math.min(Math.max((after??steps.length)-1,0),steps.length-1)]?.code;
 const selectedCode=code&&[...codes,...allCodes].includes(code)?code:
  suggestWorkArea(name,paymentName,allCodes,codes,lastCode);
 const stage=requirements[selectedCode]??defaultStageRequirements(selectedCode);
 const field=kind==='work'?'work':kind==='material'?'materials':'checks';
 const existingChoices=stage[field];
 const preservedReports=codes.flatMap(area=>(requirements[area]?.reports??[])
  .map(report=>({area,report})));
 const priorChecks=(position:number)=>steps.slice(0,position+1).filter(item=>isCheck(item.kind));
 const reset=()=>{
  setAfter(null);setEditing(null);setName('');setChoice('new');setError('');
 };
 const open=(position:number)=>{
  setAfter(position);setEditing(null);setKind('work');setName('');
  setCode('');setChoice('new');setExisting('0');
  setQcPosition('');setError('');
 };
 const itemName=(item:QuotationMilestoneStep)=>{
  const current=requirements[item.code]??defaultStageRequirements(item.code);
  return current[belongs(item)][item.index]??'Missing item';
 };
 const protective=(item:QuotationMilestoneStep)=>{
  if(!isCheck(item.kind))return false;
  const base=defaultStageRequirements(item.code);
  const template=milestoneConstructionStages().find(s=>s.code===item.code.split('/')[0]);
  return template?.holdPoint==='structural'&&base.checks.includes(itemName(item));
 };
 const move=(index:number,direction:number)=>{
  const other=index+direction;
  if(other<0||other>=steps.length)return;
  const next=[...steps];[next[index],next[other]]=[next[other]!,next[index]!];
  if(next.some((item,i)=>item.kind==='qc'&&
    !next.slice(0,i).some(x=>isCheck(x.kind)&&x.code===item.code&&x.index===item.index))){
   setError('Keep the check or test before its company QC.');return;
  }
  onChange(next,requirements);
  setError('');
 };
 const save=()=>{
  if(after===null&&editing===null)return;
  if(kind==='payment'&&editing===null){reset();onAddPayment();return;}
  const position=editing??after!+1;
  const target=editing===null?null:steps[position]!;
  const inspected=kind==='qc'&&qcPosition.includes(':')?
    priorChecks(after??-1).find(item=>item.code+':'+item.index===qcPosition):undefined;
  const chosen=target?.code??inspected?.code??selectedCode;
  if(!chosen||![...codes,...allCodes].includes(chosen)){
   setError('Unable to identify a construction work area. Open Advanced and select one.');return;
  }
  const current=requirements[chosen]??defaultStageRequirements(chosen);
  if(editing!==null&&target?.kind==='qc'){
   setError('QC is linked to the site check. Delete and add it after the correct check to change it.');return;
  }
  if(kind==='qc'&&editing===null){
   if(!inspected){setError('Choose which earlier site check QC will inspect.');return;}
   const index=inspected.index;
   const check=priorChecks(after!).find(x=>x.code===chosen&&x.index===index);
   if(!check){setError('Add and position a site check/test before QC.');return;}
   if(steps.some(x=>x.kind==='qc'&&x.code===chosen&&x.index===index)){
    setError('This site check already has a QC inspection.');return;
   }
   const next=[...steps];next.splice(position,0,{kind:'qc',code:chosen,index});
   onChange(next,requirements);reset();return;
  }
  if(editing!==null&&target){
   const f=belongs(target),value=name.replace(/\s+/g,' ').trim();
   if(value.length<minLength(target.kind)||value.length>180){
    setError('Enter a descriptive item name (up to 180 characters).');return;
   }
   if(protective(target)){setError('Required structural checks cannot be renamed.');return;}
   const entries=[...current[f]];
   if(entries.some((item,i)=>i!==target.index&&item.toLowerCase()===value.toLowerCase())){
    setError('This name is already used for this work area.');return;
   }
   entries[target.index]=value;
   onChange(steps,{...requirements,[chosen]:{...current,[f]:entries}});
   reset();return;
  }
  const key=kind as Exclude<Kind,'payment'>;
  if((key==='check'||key==='test')&&!steps.slice(0,after!+1).some(s=>s.kind==='work'&&s.code===chosen)){
   setError('Add work in this construction area before its site check or test.');return;
  }
  const listField=key==='work'?'work':key==='material'?'materials':'checks';
  // The first manually added step replaces the old bulky template selection
  // for this real work area. Structural hold-point checks stay mandatory.
  // Always reuse persisted quotation requirements. Switching to a typed
  // editor must never clear previously selected work, materials, or reports.
  let base=requirements[chosen];
  // A preparatory Material may appear before its first Work. Do not retain
  // a hidden placeholder template work once the user adds actual work.
  if(base&&key==='work'&&!plannedWorkCodes.includes(chosen)&&
    base.work.length===1&&
    base.work[0]===defaultStageRequirements(chosen).work[0]){
   base={...base,work:[]};
  }
  if(!base){
   const original=defaultStageRequirements(chosen);
   const template=milestoneConstructionStages().find(s=>s.code===chosen.split('/')[0]);
   const structural=template?.holdPoint==='structural';
   base={...original,work:key==='work'?[]:[original.work[0]!],
    materials:[],checks:structural?[...original.checks]:[],reports:[]};
  }
  const values=[...base[listField]];
  let index:number;
  if(choice==='existing'){
   const previous=existingChoices[Number(existing)];
   if(!previous){setError('Choose an existing item.');return;}
   const found=values.indexOf(previous);
   if(found!==-1)index=found;
   else{
    if(values.length>=50){setError('Too many selected items.');return;}
    index=values.length;values.push(previous);
   }
  }else{
   const clean=name.replace(/\s+/g,' ').trim();
   if(clean.length<minLength(key)||clean.length>180||values.length>=50){
    setError('Enter an item name (2–180 characters; site checks need at least 3).');return;
   }
   if(values.some(x=>x.toLowerCase()===clean.toLowerCase())){
    setError('Already included. Choose that existing item instead.');return;
   }
   index=values.length;values.push(clean);
  }
  if(steps.some(x=>x.code===chosen&&x.index===index&&
    (key==='test'||key==='check'?isCheck(x.kind):x.kind===key))){
   setError('This work, material or check is already in the workflow.');return;
  }
  const nextRequirements={...requirements,[chosen]:{...base,[listField]:values}};
  const next=[...steps];next.splice(position,0,{kind:key,code:chosen,index});
  onChange(next,nextRequirements);reset();
 };
 const remove=(position:number)=>{
  const item=steps[position];if(!item)return;
  if(protective(item)){setError('Mandatory structural checks must remain.');return;}
  const name=itemName(item);
  const text=item.kind==='qc'?'Remove this QC checkpoint? The site check stays.':
   'Delete '+name+' from this quotation workflow?';
  if(!window.confirm(text))return;
  if(item.kind==='qc'){onChange(steps.filter((_,i)=>i!==position),requirements);reset();return;}
  const source=requirements[item.code]??defaultStageRequirements(item.code);
  const f=belongs(item);
  // Deletion should remove the underlying selected requirement, not just
  // hide it from the editor. Protect the only required work item.
  if(f==='work'&&source.work.length===1){
   setError('Each construction stage needs at least one work item. Edit it instead.');return;
  }
  const remaining=source[f].filter((_,index)=>index!==item.index);
  const next=steps.flatMap((x,i)=>{
   if(i===position)return [];
   if(item.kind!=='work'&&isCheck(item.kind)&&x.kind==='qc'&&
     x.code===item.code&&x.index===item.index)return [];
   const same=x.code===item.code&&belongs(x)===f;
   return [{...x,index:same&&x.index>item.index?x.index-1:x.index}];
  });
  onChange(next,{...requirements,[item.code]:{...source,[f]:remaining}});
  reset();
 };
 const beginEdit=(position:number)=>{
  const item=steps[position];if(!item)return;
  setEditing(position);setAfter(null);setName(itemName(item));
  setKind(item.kind);setCode(item.code);setError('');
 };
 const button=(text:string,onClick:()=>void,disabled=false)=><button type="button" disabled={disabled} onClick={onClick}>{text}</button>;
 return <div className="qs-one-flow">
  <div className="qs-one-flow-intro"><strong>{'Stage '+(paymentIndex+1)+' · Work sequence'}</strong>
   <small>Existing saved work is retained. Type the next activity and add it in order.</small>
  </div>
  {editable&&<details className="qs-one-flow-area-picker">
   <summary>Advanced · Change underlying construction stage mapping</summary>
   <p>Optional. Work areas are suggested automatically from the item name and payment stage. Reassign a work area here only when needed.</p>
   <small>Currently linked: {codes.length?codes.map(label).join(' · '):'Choose an area below'}</small>
   <select aria-label="Add or move construction work area" defaultValue=""
    onChange={event=>{if(event.target.value)onLinkStage(event.target.value);event.target.value='';}}>
    <option value="" disabled>Link another work area</option>
    {allCodes.filter(value=>!codes.includes(value)).map(value=>
     <option key={value} value={value}>{label(value)}</option>)}
   </select>
  </details>}
  {preservedReports.length>0&&<details className="qs-one-flow-advanced qs-one-flow-reports">
   <summary>Previously saved reports & evidence ({preservedReports.length})</summary>
   <ul>{preservedReports.map((item,index)=><li key={item.area+'-'+index}>
    {item.report} <small>({label(item.area)})</small>
   </li>)}</ul>
   <small>These reports are retained in the quotation and project record.</small>
  </details>}
  {steps.length===0&&<p className="qs-one-flow-empty">No saved work items in this payment stage. Type an activity below to add it.</p>}
  <ol className="qs-one-flow-list">
   {steps.map((item,index)=><li key={item.kind+'-'+item.code+'-'+item.index} className="qs-one-flow-item">
    <span className="qs-one-flow-num">{index+1}</span>
    <div className="qs-one-flow-detail">
     <small>{names[item.kind]} · {label(item.code)}</small>
     <strong>{itemName(item)}</strong>
     {item.kind==='material'&&<small>Quantity, order and delivery tracked under this work stage</small>}
     {item.kind==='qc'&&<small>Separate on-site Pass/Fail after the linked check</small>}
    </div>
    {editable&&<div className="qs-one-flow-controls">
     {button('↑',()=>move(index,-1),index===0)}
     {button('↓',()=>move(index,1),index===steps.length-1)}
     {button('Edit',()=>beginEdit(index),item.kind==='qc'||protective(item))}
     {button('Delete',()=>remove(index),protective(item))}
     {button('+ Add after',()=>open(index))}
    </div>}
    {editable&&editing===index&&<div className="qs-one-flow-form">
     <label>Edit {names[item.kind]}<input value={name} maxLength={180}
      onChange={e=>setName(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();save();}}}/></label>
     {error&&<p role="alert">{error}</p>}
     <div className="qs-one-flow-buttons">{button('Save changes',save)}{button('Cancel',reset)}</div>
    </div>}
    {editable&&after===index&&renderForm()}
   </li>)}
  </ol>
  {editable&&<div className="qs-one-flow-footer">
   {button('+ Add work / check',()=>open(steps.length-1))}
   {steps.length>0&&button('+ Add at end',()=>open(steps.length-1))}
  </div>}
  {editable&&after===-1&&renderForm()}
  {error&&after===null&&editing===null&&<p className="qs-one-flow-error" role="alert">{error}</p>}
 </div>;
 function renderForm(){
  const available=kind==='qc'?priorChecks(after??-1):[];
  const current=requirements[selectedCode]??defaultStageRequirements(selectedCode);
  const pickedExisting=current[field];
  return <div className="qs-one-flow-form">
   <label>Next item
    <input aria-label="Type next construction work or check" value={name} maxLength={180}
     autoFocus={kind!=='qc'&&kind!=='payment'}
     onChange={event=>{setName(event.target.value);setError('');}}
     onKeyDown={event=>{
      if(event.key==='Enter'){event.preventDefault();save();}
     }}
     disabled={kind==='qc'||kind==='payment'||choice==='existing'}
     placeholder={kind==='material'?'Type material, e.g. Steel for footing':
      kind==='check'?'Type site check, e.g. Excavation depth and width':
      kind==='test'?'Type test, e.g. Concrete slump test':
      'Type work, e.g. Footing bar bending'}/>
   </label>
   <label>Item type
    <select aria-label="Choose item type" value={kind}
     onChange={event=>{setKind(event.target.value as Kind);setCode('');setError('');setChoice('new');}}>
     <option value="work">Work</option>
     <option value="material">Material required</option>
     <option value="check">Site check</option>
     <option value="test">Test</option>
     <option value="qc">Company QC</option>
     <option value="payment">Payment / Next stage</option>
    </select>
   </label>
   {kind==='payment'?<p>Add the next priced payment stage without removing existing stages or amounts.</p>:null}
   {kind==='qc'?<label>QC reviews this earlier site check
    <select value={qcPosition} onChange={event=>setQcPosition(event.target.value)}>
     <option value="" disabled>Choose earlier site check or test</option>
     {available.map(item=><option key={item.code+':'+item.index}
       value={item.code+':'+item.index}>{itemName(item)}</option>)}
    </select>
   </label>:null}
   {kind!=='qc'&&kind!=='payment'&&
    <details className="qs-one-flow-advanced">
     <summary>Previous items / change work area (optional)</summary>
     <label>Work area
      <select value={selectedCode}
       onChange={event=>{setCode(event.target.value);setError('');}}>
       {[...new Set([...codes,...allCodes])].map(value=>
        <option key={value} value={value}>{label(value)}</option>)}
      </select>
     </label>
     <label>Source
      <select value={choice} onChange={event=>setChoice(event.target.value as 'new'|'existing')}>
       <option value="new">Type new item</option>
       <option value="existing">Reuse an existing saved item</option>
      </select>
     </label>
     {choice==='existing'&&<label>Existing saved item
      <select value={existing} onChange={event=>setExisting(event.target.value)}>
       {pickedExisting.map((item,index)=>
        <option key={index} value={index}>{item}</option>)}
      </select>
     </label>}
    </details>}
   {kind!=='payment'&&selectedCode&&<small className="qs-one-flow-destination">
    {kind==='qc'?'QC recorded against':'Will be recorded under'} {label(selectedCode)}
    {!codes.includes(selectedCode)?' · Existing data will be preserved if reassignment is needed':''}
   </small>}
   {error&&<p role="alert">{error}</p>}
   <div className="qs-one-flow-buttons">
    {button(kind==='payment'?'Add payment stage':'Add '+names[kind],save)}
    {button('Cancel',reset)}
   </div>
  </div>;
 }
}
