'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
 defaultStageRequirements,renameStageRequirement,type StageRequirements,
} from '@business-os/core/quotation-stage-requirements';
import { milestoneConstructionStages } from '@business-os/core/construction-payment-schedule';

const fields=[
 {key:'work',title:'Work items',hint:'Edit or select actual work activities to be completed on site'},
 {key:'materials',title:'Major materials to order',hint:'Plan main supplier orders for this stage. Small site purchases and miscellaneous costs belong in the existing Expenses register, not a second material-order list.'},
 {key:'checks',title:'Quality checks & tests',hint:'Edit check names for this stage; photo evidence and authorized QC remain separate'},
 {key:'reports',title:'Evidence & reports',hint:'Choose the documents, site photos and test certificates to collect'},
] as const;
type Field=typeof fields[number]['key'];
function names(base:readonly string[],chosen:readonly string[]){
 return [...new Set([...base,...chosen])];
}
function Section({field,title,hint,base,requirements,locked,onUpdate,editable}:{
 field:Field;title:string;hint:string;base:readonly string[];
 requirements:StageRequirements;locked:boolean;
 editable:boolean;onUpdate:(next:StageRequirements)=>void;
}){
 const [name,setName]=useState('');
 const [editing,setEditing]=useState<string|null>(null);
 const [draft,setDraft]=useState('');
 const [error,setError]=useState('');
 const current=requirements[field];
 const rows=names(base,current);
 const add=()=>{
  const entered=name.replace(/\s+/g,' ').trim();
  if(entered.length<(field==='checks'?3:2)||entered.length>180||current.some(v=>v.toLowerCase()===entered.toLowerCase()))return;
  onUpdate({...requirements,[field]:[...current,entered]});
  setName('');
 };
 const startEdit=(label:string)=>{
  setEditing(label);setDraft(label);setError('');
 };
 const stopEdit=()=>{setEditing(null);setDraft('');setError('');};
 const saveEdit=(label:string)=>{
  try{
   const required=locked&&base.includes(label);
   const changed=renameStageRequirement(requirements,field,label,draft,required);
   onUpdate(changed);stopEdit();
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Unable to rename this item');
  }
 };
 return <details className="qs-stage-requirements-section">
  <summary><span>{title}</span><small>{current.length} selected</small></summary>
  <p>{hint}{locked?' · Required structural checks are protected.':''}</p>
  {field==='materials'&&<p className="qs-stage-material-order-note">
   This is the <strong>quotation procurement plan</strong>, not an order or expense.
   Confirm quantities, grades and brands during the project, then place orders through Materials &amp; orders.
   Record small or miscellaneous purchases separately in <Link href="/dashboard/finance?tab=expenses">Finance → Expenses</Link>.
  </p>}
  <div className="qs-stage-requirements-items">
   {rows.map(label=>{
    const checked=current.includes(label);
    const required=locked&&base.includes(label);
    const canRename=editable&&checked&&!required;
    return <div key={label} className="qs-stage-requirement-row">
     <label className="qs-stage-requirement-option">
      <input type="checkbox" checked={checked} disabled={!editable||required}
       onChange={e=>{
        if(required)return;
        const next=e.target.checked?[...current,label]:current.filter(x=>x!==label);
        if(field==='work'&&next.length===0)return;
        if(editing===label)stopEdit();
        onUpdate({...requirements,[field]:next});
       }}/>
      <span>{label}</span>{required&&<small>Required</small>}
     </label>
     {canRename&&<button type="button" className="qs-stage-requirement-edit"
      aria-label={'Edit '+label} aria-expanded={editing===label}
      onClick={()=>editing===label?stopEdit():startEdit(label)}>
      <span aria-hidden="true">✎</span> {editing===label?'Cancel':'Edit'}
     </button>}
     {editing===label&&canRename&&<div className="qs-stage-rename">
      <label htmlFor={'qs-stage-rename-'+field}>Edit {title.toLowerCase()} entry</label>
      <input id={'qs-stage-rename-'+field} maxLength={180} value={draft}
       onChange={e=>{setDraft(e.target.value);if(error)setError('');}}
       onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveEdit(label);}
        if(e.key==='Escape'){e.preventDefault();stopEdit();}}}/>
      <div className="qs-stage-rename-actions">
       <button type="button" onClick={()=>saveEdit(label)}>Save item</button>
       <button type="button" onClick={stopEdit}>Cancel</button>
      </div>
      {error&&<p role="alert" className="qs-stage-rename-error">{error}</p>}
     </div>}
    </div>;
   })}
  </div>
  {editable&&<div className="qs-stage-add-line">
   <input aria-label={'New '+title.toLowerCase()} maxLength={180}
    value={name} onChange={e=>setName(e.target.value)}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
    placeholder={field==='materials'?'Add a main material to order':'Add a custom '+title.toLowerCase().replace(/s$/,'')}/>
   <button type="button" onClick={add} disabled={name.trim().length<(field==='checks'?3:2)}>+ Add</button>
  </div>}
 </details>;
}
export function StageRequirementsEditor({code,value,editable,onChange,onApplyRelated,relatedCount}:{
 code:string;value:StageRequirements|undefined;editable:boolean;
 onChange:(value:StageRequirements)=>void;
 onApplyRelated?:(value:StageRequirements)=>void;relatedCount:number;
}){
 const defaults=defaultStageRequirements(code);
 const requirements=value??defaults;
 const template=milestoneConstructionStages().find(x=>x.code===code.split('/')[0]);
 const structural=template?.holdPoint==='structural';
 const title=code.replaceAll('_',' ').replace('/',' · ');
 return <div className="qs-stage-requirements-editor">
  <div className="qs-stage-requirements-title">
   <strong>{title}</strong><small>{value?'Quotation customized':'Standard requirements'}</small>
  </div>
  {fields.map(section=><Section key={section.key} field={section.key}
    title={section.title} hint={section.hint}
    base={defaults[section.key]} requirements={requirements}
    locked={section.key==='checks'&&Boolean(structural)}
    editable={editable} onUpdate={onChange}/>)}
  {editable&&<div className="qs-stage-requirements-actions">
   {value&&<button type="button" onClick={()=>onChange(defaults)}>
    Restore standard requirements for this stage
   </button>}
   {relatedCount>1&&onApplyRelated&&<button type="button"
    onClick={()=>onApplyRelated(requirements)}>
    Apply these requirements to all {relatedCount} {(code.split('/')[0]??'').replaceAll('_',' ')} floors
   </button>}
  </div>}
  {!editable&&<p className="qs-stage-requirements-foot">
    This issued quotation is read-only. Create an editable revision to change its scope.
   </p>}
  <p className="qs-stage-requirements-foot">Save Payment Schedule to keep these edits with this quotation.
   Stage requirements guide future work and material ordering after agreement; this editor
   never places purchase orders, records petty cash or certifies QC. Scope and price changes
   require the appropriate quotation revision. Mandatory structural approvals remain protected.</p>
 </div>;
}
