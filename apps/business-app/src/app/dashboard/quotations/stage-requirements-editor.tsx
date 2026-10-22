'use client';
import { useState } from 'react';
import {
 defaultStageRequirements,type StageRequirements,
} from '@business-os/core/quotation-stage-requirements';
import { milestoneConstructionStages } from '@business-os/core/construction-payment-schedule';

const fields=[
 {key:'work',title:'Work items',hint:'Activities completed one by one on site'},
 {key:'materials',title:'Materials to arrange',hint:'Choose quantities separately when requesting materials'},
 {key:'checks',title:'Quality checks & tests',hint:'Photo evidence and formal approval remain separate'},
 {key:'reports',title:'Evidence & reports',hint:'Documents and photos to collect'},
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
 const current=requirements[field];
 const rows=names(base,current);
 const add=()=>{
  const entered=name.replace(/\s+/g,' ').trim();
  if(entered.length<(field==='checks'?3:2)||entered.length>180||current.some(v=>v.toLowerCase()===entered.toLowerCase()))return;
  onUpdate({...requirements,[field]:[...current,entered]});
  setName('');
 };
 return <details className="qs-stage-requirements-section">
  <summary><span>{title}</span><small>{current.length} selected</small></summary>
  <p>{hint}{locked?' · Required structural checks cannot be removed.':''}</p>
  <div className="qs-stage-requirements-items">
   {rows.map((label,index)=>{
    const checked=current.includes(label);
    const required=locked&&base.includes(label);
    return <label key={index} className="qs-stage-requirement-option">
     <input type="checkbox" checked={checked} disabled={!editable||required}
      onChange={e=>{
       if(required)return;
       const next=e.target.checked?[...current,label]:current.filter(x=>x!==label);
       if(field==='work'&&next.length===0)return;
       onUpdate({...requirements,[field]:next});
      }}/>
     <span>{label}</span>{required&&<small>Required</small>}
    </label>;
   })}
  </div>
  {editable&&<div className="qs-stage-add-line">
   <input aria-label={'New '+title.toLowerCase()} maxLength={180}
    value={name} onChange={e=>setName(e.target.value)}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
    placeholder={'Add a custom '+title.toLowerCase().replace(/s$/,'')}/>
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
   <strong>{title}</strong><small>{value?'Project customized':'Standard requirements'}</small>
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
  <p className="qs-stage-requirements-foot">These project requirements become construction work, material planning and QC guidance after the accepted quotation is converted. Adding scope or cost requires an appropriate quotation revision. Mandatory structural approvals cannot be removed.</p>
 </div>;
}
