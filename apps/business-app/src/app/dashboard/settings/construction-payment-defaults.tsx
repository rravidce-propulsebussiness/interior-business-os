'use client';
import {useActionState,useState} from 'react';
import {companyWorkAreaLabel,inferCompanyWorkAreaCode,type CompanyConstructionPaymentRow,type CompanyWorkStep} from '@business-os/core/company-construction-defaults';
import {saveConstructionPaymentDefaults} from './payment-default-actions';

type Kind=CompanyWorkStep['kind'];
const labels:Record<Kind,string>={
 work:'Work',material:'Material',check:'Site check',test:'Test',qc:'Company QC',
};
const prettify=(code:string)=>code.replaceAll('_',' ');
const isCheck=(step:CompanyWorkStep)=>step.kind==='check'||step.kind==='test';
const link=(step:CompanyWorkStep)=>step.area+'|'+step.name.toLowerCase();

function DefaultPaymentStage({row,index,canEdit,onChange,onRemove}:{
 row:CompanyConstructionPaymentRow;index:number;canEdit:boolean;
 onChange:(next:CompanyConstructionPaymentRow)=>void;onRemove:()=>void;
}) {
 const steps=row.steps??[];
 const areas=row.areas?.length?row.areas:
  [...new Set(steps.map(item=>item.area))];
 const [kind,setKind]=useState<Kind>('work');
 const [name,setName]=useState('');
 const [area,setArea]=useState('');
 const [areaText,setAreaText]=useState('');
 const [newAreaText,setNewAreaText]=useState('');
 const [checkRef,setCheckRef]=useState('');
 const [error,setError]=useState('');
 const [after,setAfter]=useState<number|null>(null);
 const chosenArea=areas.includes(area)?area:areas[0]??'PRECONSTRUCTION';
 const areaName=(code:string)=>companyWorkAreaLabel(row,code);
 const typedTarget=areas.find(code=>areaName(code).toLowerCase()===areaText.trim().toLowerCase())
  ??inferCompanyWorkAreaCode(areaText)??chosenArea;
 const typedArea=typedTarget;
 const prior=steps.slice(0,after===null?steps.length:after+1).filter(isCheck);
 const available=prior.filter(x=>x.area===typedArea);
 const current=checkRef?available.find(x=>link(x)===checkRef):available.at(-1);
 const editRows=(next:CompanyWorkStep[])=>{onChange({...row,steps:next});setError('');};
 const add=(position:number)=>{
  setAfter(position);setName('');setKind('work');
  const initial=steps[position]?.area??areas[0]??'PRECONSTRUCTION';
  setArea(initial);setAreaText(areaName(initial));
  setCheckRef('');setError('');
 };
 const save=()=>{
  const labelText=areaText.trim().replace(/\s+/g,' ');
  if(labelText.length<2||labelText.length>80){
   setError('Type a work-area name (2–80 characters).');return;
  }
  if(!areas.includes(typedArea)){
   setError('Add this construction work area above first so it stays linked to the correct project stage.');return;
  }
  const title=kind==='qc'?current?.name:name.trim().replace(/\s+/g,' ');
  if(!title||title.length<2||title.length>180){setError('Enter a work/check name or select an earlier check for QC.');return;}
  if(kind==='qc'&&!current){setError('Select an earlier site check or test for company QC.');return;}
  if(kind==='check'||kind==='test'){
   if(title.length<3){setError('Check/test needs at least 3 characters.');return;}
  }
  const next={kind,name:title,area:typedArea} as CompanyWorkStep;
  if(steps.some(x=>x.area===next.area&&x.name.toLowerCase()===next.name.toLowerCase()&&
    (x.kind===next.kind||(['check','test'].includes(x.kind)&&['check','test'].includes(next.kind))))){
   setError('This item is already in the payment stage.');return;
  }
  const updated=[...steps];updated.splice((after??steps.length-1)+1,0,next);
  onChange({...row,areaLabels:{...(row.areaLabels??{}),[typedArea]:labelText},
   steps:updated});setAfter(null);setName('');setCheckRef('');setError('');
 };
 const edit=(position:number,changes:Partial<CompanyWorkStep>)=>{
  const currentItem=steps[position]!;
  if(currentItem.kind==='qc')return;
  const next={...currentItem,...changes};
  const updated=steps.map((entry,i)=>{
   if(i===position)return next;
   if(isCheck(currentItem)&&entry.kind==='qc'&&entry.area===currentItem.area&&
      entry.name===currentItem.name)return {...entry,name:next.name,area:next.area};
   return entry;
  });
  editRows(updated);
 };
 const removeStep=(position:number)=>{
  const value=steps[position]!;
  const updated=steps.filter((s,i)=>i!==position&&
   !(isCheck(value)&&s.kind==='qc'&&link(s)===link(value)));
  editRows(updated);
 };
 const move=(index:number,dir:number)=>{
  const target=index+dir;
  if(target<0||target>=steps.length)return;
  const next=[...steps];
  [next[index],next[target]]=[next[target]!,next[index]!];
  if(next.some((entry,i)=>entry.kind==='qc'&&!next.slice(0,i).some(step=>
   isCheck(step)&&link(step)===link(entry)))){
   setError('Company QC must follow its linked site check/test.');return;
  }
  editRows(next);
 };
 return <li className="us-payment-stage" key={index}>
  <div className="us-payment-stage-main">
   <span className="us-payment-default-index">{index+1}</span>
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
   {canEdit&&<button type="button" onClick={onRemove} className="us-payment-remove">
    Remove stage
   </button>}
  </div>
  <details className="us-payment-stage-work">
   <summary>Work, materials, checks, tests &amp; QC <strong>{steps.length} included</strong></summary>
   {canEdit&&<div className="us-payment-work-areas">
    <small>Work areas for this payment stage — type names directly</small>
    <div className="us-payment-area-tags">
     {areas.map(code=><label className="us-payment-area-name" key={code}>
      <span>Work area</span>
      <input type="text" maxLength={80} value={areaName(code)}
       aria-label={'Rename construction work area '+prettify(code)}
       onChange={event=>onChange({...row,areaLabels:{
        ...(row.areaLabels??{}),[code]:event.target.value,
       }})}/>
      {!steps.some(step=>step.area===code)&&<button type="button"
       aria-label={'Remove work area '+areaName(code)}
       onClick={()=>onChange({...row,
        areas:areas.filter(value=>value!==code),
        areaLabels:Object.fromEntries(Object.entries(row.areaLabels??{}).filter(([key])=>key!==code)),
       })}>×</button>}
     </label>)}
    </div>
    <div className="us-payment-area-add">
     <input type="text" value={newAreaText} maxLength={80}
      aria-label="Type construction work area name"
      placeholder="Type work area, e.g. Foundation or Site marking"
      onChange={event=>{setNewAreaText(event.target.value);setError('');}}/>
     <button type="button" onClick={()=>{
      const typed=newAreaText.trim().replace(/\s+/g,' ');
      if(typed.length<2){setError('Enter the new work-area name.');return;}
      const mapped=inferCompanyWorkAreaCode(typed)??(areas.length===1?areas[0]:null);
      if(!mapped){
       setError('Include a construction type in the name (Foundation, Design, RCC, etc.) so it links to the correct project stage, or rename an existing work area above.');
       return;
      }
      if(areas.includes(mapped)){
       onChange({...row,areaLabels:{...(row.areaLabels??{}),[mapped]:typed}});
      }else{
       if(areas.length>=15){setError('This payment already has 15 work areas.');return;}
       onChange({...row,areas:[...areas,mapped],
        areaLabels:{...(row.areaLabels??{}),[mapped]:typed}});
      }
      setNewAreaText('');setError('');
     }}>+ Add area</button>
    </div>
    <small className="us-info">Your names are displayed in this template. Existing project stage links are preserved automatically.</small>
   </div>}
   <p className="us-info">These steps will be copied into new quotations. Edit the sequence here once;
    modify a quotation separately for any particular project.</p>
   {steps.length? <div className="us-payment-step-list">{steps.map((item,position)=>
    <div key={position} className="us-payment-step">
     <small>{position+1}. {labels[item.kind]} · {areaName(item.area)}</small>
     <div className="us-payment-step-edit">
      {canEdit&&item.kind!=='qc'?<input aria-label={'Edit '+labels[item.kind]+' '+(position+1)}
       value={item.name} maxLength={180}
       onChange={e=>edit(position,{name:e.target.value})}/>:
       <strong>{item.name}</strong>}
      {canEdit&&<div className="us-payment-step-actions">
       <button type="button" onClick={()=>move(position,-1)} disabled={position===0}
        aria-label={'Move step '+(position+1)+' up'}>↑</button>
       <button type="button" onClick={()=>move(position,1)} disabled={position===steps.length-1}
        aria-label={'Move step '+(position+1)+' down'}>↓</button>
       <button type="button" onClick={()=>add(position)}>+ Next</button>
       <button type="button" onClick={()=>removeStep(position)}>Delete</button>
      </div>}
     </div>
    </div>)}</div>:<p className="us-info">No steps yet. Add work in the order it should happen on site.</p>}
   {canEdit&&<button type="button" className="us-payment-add-work"
     onClick={()=>add(steps.length-1)}>+ Add work, material or check</button>}
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
    <label>Work area
     <input type="text" maxLength={80} aria-label="Type default step work area"
      value={areaText} onChange={event=>setAreaText(event.target.value)}
      placeholder="e.g. Foundation, Site marking, Design"/>
     <small>Linked internally to {prettify(typedArea)}</small>
    </label>
    {kind==='qc'?<label>QC for which earlier site check/test?
     <select value={current?link(current):''} onChange={e=>setCheckRef(e.target.value)}
      aria-label="QC linked site check">
      {available.length===0&&<option value="">Add site check first</option>}
      {available.map(step=><option key={link(step)} value={link(step)}>{step.name}</option>)}
     </select>
    </label>:
     <label>Item name
      <input autoFocus value={name} maxLength={180} placeholder="e.g. Footing bar bending"
       aria-label="New default work item name" onChange={e=>setName(e.target.value)}/>
     </label>}
    {error&&<p role="alert" className="us-payment-error">{error}</p>}
    <div className="us-payment-step-actions">
     <button type="button" className="us-payment-add-work" onClick={save}>Add {labels[kind]}</button>
     <button type="button" onClick={()=>{setAfter(null);setError('');}}>Cancel</button>
    </div>
   </div>}
   {after===null&&error&&<p role="alert" className="us-payment-error">{error}</p>}
  </details>
 </li>;
}

export function ConstructionPaymentDefaults({initial,canEdit}:{
 initial:CompanyConstructionPaymentRow[];canEdit:boolean;
}) {
 const [rows,setRows]=useState<CompanyConstructionPaymentRow[]>(initial.map(x=>({...x,areas:[...(x.areas??[])],
  steps:[...(x.steps??[])]})));
 const [state,action,pending]=useActionState(saveConstructionPaymentDefaults,{saved:false,message:''});
 const total=rows.reduce((sum,row)=>sum+(Number(row.percent)||0),0);
 const update=(index:number,next:CompanyConstructionPaymentRow)=>{
  setRows(previous=>previous.map((row,i)=>i===index?next:row));
 };
 return <div className="us-payment-defaults">
  <p className="us-info">Set payment percentages and the associated work, materials,
   site checks, tests and company QC once. These are company defaults for new construction
   quotations, not changes to any signed quotation or running project.</p>
  <form action={action}>
   <input type="hidden" name="rows" value={JSON.stringify(rows)}/>
   <ol className="us-payment-default-list">
    {rows.map((row,index)=><DefaultPaymentStage key={index} row={row} index={index}
     canEdit={canEdit} onChange={value=>update(index,value)}
     onRemove={()=>setRows(previous=>previous.filter((_,i)=>i!==index))}/>)}
   </ol>
   {canEdit&&<button type="button" className="us-payment-add"
     onClick={()=>setRows([...rows,{name:'New construction milestone',percent:0,
      areas:['PRECONSTRUCTION'],steps:[]}])}
     disabled={rows.length>=40}>+ Add payment stage</button>}
   <div className="us-payment-default-footer">
    <strong>Total: {total.toFixed(2)}%</strong>
    {canEdit&&<button type="submit" className="us-save" disabled={pending||
     Math.abs(total-100)>0.001||!rows.length||rows.some(row=>
      !row.name.trim()||row.percent<=0)}>
     {pending?'Saving…':'Save company payments & work'}
    </button>}
   </div>
   {state.message&&<p role="status" className={state.saved?'us-info':'us-payment-error'}>
    {state.message}</p>}
  </form>
 </div>;
}
