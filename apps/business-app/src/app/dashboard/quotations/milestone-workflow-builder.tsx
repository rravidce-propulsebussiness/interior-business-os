'use client';

import {useState} from 'react';
import {defaultStageRequirements,type StageRequirementsMap} from '@business-os/core/quotation-stage-requirements';
import {type QuotationMilestoneStep} from '@business-os/core/quotation-milestone-flow';
import {milestoneConstructionStages} from '@business-os/core/construction-payment-schedule';

type Kind=QuotationMilestoneStep['kind']|'payment';
type Props={
 paymentIndex:number;
 steps:QuotationMilestoneStep[];
 codes:string[];
 allCodes:string[];
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

export function MilestoneWorkflowBuilder({paymentIndex,steps,codes,allCodes,requirements,
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
 const selectedCode=codes.includes(code)?code:codes[0]??'';
 const stage=requirements[selectedCode]??defaultStageRequirements(selectedCode);
 const field=kind==='work'?'work':kind==='material'?'materials':'checks';
 const existingChoices=stage[field];
 const priorChecks=(position:number)=>steps.slice(0,position+1).filter(item=>isCheck(item.kind));
 const reset=()=>{
  setAfter(null);setEditing(null);setName('');setChoice('new');setError('');
 };
 const open=(position:number)=>{
  setAfter(position);setEditing(null);setKind('work');setName('');
  setCode(codes[0]??'');setChoice('new');setExisting('0');
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
  const chosen=target?.code??selectedCode;
  if(!chosen||!codes.includes(chosen)){setError('Select a work area linked to this payment stage.');return;}
  const current=requirements[chosen]??defaultStageRequirements(chosen);
  if(editing!==null&&target?.kind==='qc'){
   setError('QC is linked to the site check. Delete and add it after the correct check to change it.');return;
  }
  if(kind==='qc'&&editing===null){
   const index=Number(qcPosition);
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
  const listField=key==='work'?'work':key==='material'?'materials':'checks';
  let base=requirements[chosen];
  if(!base){
   const original=defaultStageRequirements(chosen);
   const template=milestoneConstructionStages().find(s=>s.code===chosen.split('/')[0]);
   const structural=template?.holdPoint==='structural';
   base={...original,work:key==='work'?[]:[original.work[0]!],
    materials:[],checks:structural?[...original.checks]:[],reports:[]};
  }
  const values=[...base[listField]];
  let index:number;
  if(choice==='existing'&&values.length){
   index=Number(existing);
   if(!values[index]){setError('Choose an existing item.');return;}
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
  <div className="qs-one-flow-intro"><strong>Work sequence</strong>
   <small>One list for this payment stage. Add only the work, materials, checks and QC you need.</small>
  </div>
  {steps.length===0&&<p className="qs-one-flow-empty">No steps added. Start with + Add to plan work after this payment milestone.</p>}
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
   {button('+ Add',()=>open(-1))}
   {steps.length>0&&button('+ Add at end',()=>open(steps.length-1))}
  </div>}
  {editable&&after===-1&&renderForm()}
  {error&&after===null&&editing===null&&<p className="qs-one-flow-error" role="alert">{error}</p>}
 </div>;
 function renderForm(){
  const available=kind==='qc'?priorChecks(after??-1):[];
  return <div className="qs-one-flow-form">
   <label>What do you want to add?
    <select value={kind} onChange={e=>{setKind(e.target.value as Kind);setError('');setChoice('new');}}>
     <option value="payment">Payment / Next stage</option>
     <option value="work">Work</option>
     <option value="material">Material required</option>
     <option value="check">Site check</option>
     <option value="test">Test</option>
     <option value="qc">Company QC</option>
    </select>
   </label>
   {kind==='payment'?<p>Creates a new payment stage with its own name, percentage, and ordered work. The existing Finance schedule remains the source of payment requests.</p>:<>
    <label>Construction stage / work area
     <select value={selectedCode} onChange={e=>{setCode(e.target.value);setError('');}}>
      {codes.map(x=><option key={x} value={x}>{label(x)}</option>)}
     </select>
    </label>
    {!codes.length&&<label>Link a construction work stage first
     <select defaultValue="" onChange={e=>{if(e.target.value)onLinkStage(e.target.value);}}>
      <option value="" disabled>Select project stage</option>
      {allCodes.map(x=><option key={x} value={x}>{label(x)}</option>)}
     </select>
    </label>}
    {kind==='qc'?<label>QC after which passed site check/test?
     <select value={qcPosition} onChange={e=>setQcPosition(e.target.value)}>
      <option value="" disabled>Choose earlier check</option>
      {available.filter(x=>!selectedCode||x.code===selectedCode).map(x=>
       <option key={x.code+'-'+x.index} value={x.index}>{itemName(x)}</option>)}
     </select>
    </label>:<>
     <label>Item
      <select value={choice} onChange={e=>setChoice(e.target.value as 'new'|'existing')}>
       <option value="new">New item</option>
       <option value="existing">Use existing item</option>
      </select>
     </label>
     {choice==='existing'?<label>Choose existing item
      <select value={existing} onChange={e=>setExisting(e.target.value)}>
       {existingChoices.map((x,i)=><option value={i} key={i}>{x}</option>)}
      </select>
     </label>:<label>{names[kind]} name
      <input value={name} maxLength={180} autoFocus onChange={e=>setName(e.target.value)}
       placeholder={kind==='work'?'e.g. Footing bar bending':kind==='material'?'e.g. Footing TMT steel':
        'e.g. Check bar bending against structural drawing'}/>
     </label>}
    </>}
   </>}
   {error&&<p role="alert">{error}</p>}
   <div className="qs-one-flow-buttons">
    {button(kind==='payment'?'Add payment stage':'Add '+names[kind],save)}
    {button('Cancel',reset)}
   </div>
  </div>;
 }
}
