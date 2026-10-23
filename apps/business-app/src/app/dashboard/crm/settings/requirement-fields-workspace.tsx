'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {saveCrm} from '../actions';
import {requirementKey,type RequirementField,type RequirementIndustry,type RequirementType} from '../requirement-fields';

const typeNames:Record<RequirementType,string>={
 text:'Text',number:'Number',select:'Select',boolean:'Yes / No',
};
type Filter='all'|'construction'|'interior';
const blank=():RequirementField=>({
 id:'',version:1,name:'',key:'',sortOrder:0,active:true,required:false,
 industryId:null,fieldType:'text',options:[],
});
function Glyph({name,size=20}:{name:string;size?:number}){
 const p:Record<string,string>={
 fields:'M5 6h14M5 12h14M5 18h14M2 6h.01M2 12h.01M2 18h.01',
 source:'M4 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM15 5l5 4-5 4M4 19h16',
 pipeline:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
 lost:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9l6 6M15 9l-6 6',
 search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM17 17l5 5',
 plus:'M12 4v16M4 12h16',
 pencil:'m14 5 5 5M4 20l4.5-1 11-11a2 2 0 0 0-5-5l-11 11L4 20Z',
 more:'M5 12h.01M12 12h.01M19 12h.01',
 chevron:'M9 18l6-6-6-6',
 drag:'M8 5h.01M15 5h.01M8 12h.01M15 12h.01M8 19h.01M15 19h.01',
 number:'M6 4v16m9-16v16M3 10h18M3 16h18',
 select:'M5 6h14M5 12h14M5 18h14M19 6l2 2M19 12l2 2',
 boolean:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8 12l3 3 5-6',
 text:'M3 6h18M12 6v14M8 20h8',
 info:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 10v6m0-10h.01',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
 trash:'M4 7h16M10 4h4m-8 3 1 14h10l1-14M10 11v6m4-6v6',
 back:'M20 12H4m7-7-7 7 7 7',
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
 stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
 strokeLinejoin="round" aria-hidden="true"><path d={p[name]??p.fields}/></svg>;
}

const nav=[
 {id:'lead_sources',label:'Sources',icon:'source'},
 {id:'crm_pipeline_stages',label:'Pipeline',icon:'pipeline'},
 {id:'crm_lost_reasons',label:'Lost Reasons',icon:'lost'},
 {id:'crm_requirement_fields',label:'Fields',icon:'fields'},
] as const;

export function RequirementFieldsWorkspace({initial,industries,canManage,total}:{
 initial:RequirementField[];industries:RequirementIndustry[];
 canManage:boolean;total:number;
}){
 const router=useRouter();
 const [fields,setFields]=useState(initial);
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<Filter>('all');
 const [orderBy,setOrderBy]=useState<'position'|'name'>('position');
 const [editing,setEditing]=useState<RequirementField|null>(null);
 const [draft,setDraft]=useState<RequirementField>(blank());
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [menu,setMenu]=useState<string|null>(null);
 useEffect(()=>setFields(initial),[initial]);
 const matchIndustry=(field:RequirementField)=>{
  if(filter==='all'||field.industryId===null)return true;
  const industry=industries.find(i=>i.id===field.industryId);
  const key=(industry?.key??industry?.name??'').toLowerCase();
  return filter==='construction'?key.includes('construct'):key.includes('interior');
 };
 const visible=useMemo(()=>fields.filter(field=>
  matchIndustry(field)&&(field.name+' '+field.key+' '+field.fieldType).toLowerCase().includes(query.toLowerCase().trim()))
  .sort((a,b)=>orderBy==='position'?a.sortOrder-b.sortOrder||a.name.localeCompare(b.name):
   a.name.localeCompare(b.name)),[fields,query,filter,orderBy,industries]);
 const industryLabel=(id:string|null)=>id?industries.find(x=>x.id===id)?.name??'Specific industry':'All industries';
 const begin=(field?:RequirementField)=>{
  const next=field?{...field,options:[...field.options]}:blank();
  setDraft(next);setEditing(next);setMenu(null);setFeedback('');
 };
 const change=(value:Partial<RequirementField>)=>setDraft(current=>({...current,...value}));
 const save=async()=>{
  const key=draft.id?draft.key:requirementKey(draft.key||draft.name);
  if(!draft.name.trim()||!key){setFeedback('Enter a question label and stable key.');return;}
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(key)){setFeedback('The stable key must start with a letter and contain lowercase letters, numbers or underscores.');return;}
  if(draft.fieldType==='select'&&!draft.options.some(option=>option.trim())){
   setFeedback('Add at least one dropdown choice.');return;
  }
  const options=draft.fieldType==='select'?
   [...new Set(draft.options.map(o=>o.trim()).filter(Boolean))]:[];
  if(options.length>100||options.some(o=>o.length>200)){
   setFeedback('Use at most 100 choices, each under 200 characters.');return;
  }
  setBusy(true);setFeedback('');
  try{
   const result=await saveCrm('crm_requirement_fields',{
    ...(draft.id?{id:draft.id,version:draft.version}:{}),
    name:draft.name.trim(),key,sort_order:draft.sortOrder,active:draft.active,
    required:draft.required,industry_id:draft.industryId,field_type:draft.fieldType,options,
   });
   if(result.id){
    setFeedback('Requirement field saved.');
    setEditing(null);router.refresh();
   }else setFeedback(result.message||'Unable to save requirement field.');
  }catch{setFeedback('Unable to save this field. Please retry.');}
  finally{setBusy(false);}
 };
 const switchActive=async(field:RequirementField)=>{
  setBusy(true);setFeedback('');setMenu(null);
  try{
   const result=await saveCrm('crm_requirement_fields',{
    id:field.id,version:field.version,name:field.name,key:field.key,
    sort_order:field.sortOrder,active:!field.active,required:field.required,
    industry_id:field.industryId,field_type:field.fieldType,options:field.options,
   });
   if(result.id){setFields(current=>current.map(x=>x.id===field.id?{
    ...x,active:!x.active,version:x.version+1}:x));router.refresh();}
   else setFeedback(result.message);
  }catch{setFeedback('Could not change field status.');}
  finally{setBusy(false);}
 };
 return <div className="crf-root">
  {editing===null?<>
   <div className="crf-heading">
    <div className="crf-crumb"><a href="/dashboard/crm/leads">CRM</a><Glyph name="chevron" size={13}/> Settings</div>
    <h1>Requirement Fields</h1><p>Capture the right project details on every lead.</p>
   </div>
   <div className="crf-info"><Glyph name="info" size={22}/><span>
    These fields appear in your lead information forms. Configure questions to match your company's requirements.
   </span></div>
   <nav className="crf-nav" aria-label="CRM settings">
    {nav.map(item=><a href={'/dashboard/crm/settings?entity='+item.id}
      key={item.id} className={item.id==='crm_requirement_fields'?'active':''}
      aria-current={item.id==='crm_requirement_fields'?'page':undefined}>
      <Glyph name={item.icon} size={17}/>{item.label}</a>)}
   </nav>
   <div className="crf-tools">
    <label className="crf-search"><Glyph name="search" size={18}/>
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Search fields..." aria-label="Search requirement fields"/>
    </label>
    <div className="crf-filterline">
     <div className="crf-chips" aria-label="Filter by industry">
      {(['all','construction','interior'] as const).map(f=><button type="button"
       key={f} onClick={()=>setFilter(f)} className={filter===f?'selected':''}
       aria-pressed={filter===f}>{f==='all'?'All':f==='interior'?'Interiors':'Construction'}</button>)}
     </div>
     <button type="button" className="crf-order" onClick={()=>setOrderBy(v=>v==='position'?'name':'position')}>
      ↕ {orderBy==='position'?'Order':'Name'}</button>
    </div>
   </div>
   {feedback&&<p role="status" className="crf-feedback">{feedback}</p>}
   <div className="crf-list">
    {visible.map((field,index)=><article className="crf-row" key={field.id}>
     <span className="crf-grip" title="Display position">{field.sortOrder||index+1}<Glyph name="drag" size={14}/></span>
     <span className={'crf-type-icon type-'+field.fieldType}><Glyph name={field.fieldType}/></span>
     <div className="crf-row-name"><strong>{field.name}</strong>
      <small>{typeNames[field.fieldType]} <span>·</span> {industryLabel(field.industryId)}</small>
      {field.required&&<span className="crf-required">Required</span>}
     </div>
     <span className={'crf-status '+(field.active?'active':'inactive')}>{field.active?'Active':'Inactive'}</span>
     {canManage&&<>
      <button className="crf-icon-button" type="button" onClick={()=>begin(field)}
       aria-label={'Edit '+field.name}><Glyph name="pencil" size={19}/></button>
      <div className="crf-more-wrap">
       <button className="crf-icon-button" type="button" aria-label={'More actions for '+field.name}
        aria-expanded={menu===field.id} onClick={()=>setMenu(v=>v===field.id?null:field.id)}>
        <Glyph name="more" size={19}/></button>
       {menu===field.id&&<div className="crf-menu">
        <button type="button" disabled={busy} onClick={()=>void switchActive(field)}>
         {field.active?'Deactivate field':'Activate field'}</button>
       </div>}
      </div>
     </>}
    </article>)}
    {!visible.length&&<p className="crf-empty">No matching requirement fields. Change your filters or add a field.</p>}
   </div>
   {total>fields.length&&<p className="crf-hint">Showing {fields.length} of {total} configured fields. Use pagination below to access other records.</p>}
   {canManage&&<button className="crf-add" type="button" onClick={()=>begin()}>
    <Glyph name="plus" size={19}/> Add Field
   </button>}
  </>:<>
   <button type="button" className="crf-back" onClick={()=>{setEditing(null);setFeedback('');}}>
    <Glyph name="back" size={20}/> <span>{draft.id?'Edit Requirement Field':'New Requirement Field'}</span>
   </button>
   <p className="crf-editor-intro">{draft.id?'Update how this question appears in lead forms.':
    'Add a custom field to capture specific information from your leads.'}</p>
   <div className="crf-editor">
    <label>Question label <b>*</b>
     <input value={draft.name} maxLength={200} autoFocus
      placeholder="e.g. Number of Floors" onChange={e=>change({
       name:e.target.value,...(!draft.id?{key:requirementKey(e.target.value)}:{}),
      })}/>
     <small>This will appear when your team adds or edits a lead.</small>
    </label>
    <label>Stable key
     <input value={draft.key} disabled={Boolean(draft.id)}
      maxLength={64} onChange={e=>change({key:e.target.value.toLowerCase()})}/>
     <small>{draft.id?'Cannot change after creation: existing lead answers use this key.':
      'Used internally to save answers. Generated from the label; you can edit it before saving.'}</small>
    </label>
    <div className="crf-editor-group">
     <span className="crf-label">Industry</span>
     <div className="crf-industry-options">
      <button type="button" aria-pressed={draft.industryId===null}
       className={draft.industryId===null?'selected':''} onClick={()=>change({industryId:null})}>⌂ Any industry</button>
      {industries.map(i=><button type="button" key={i.id}
       aria-pressed={draft.industryId===i.id}
       className={draft.industryId===i.id?'selected':''}
       onClick={()=>change({industryId:i.id})}>{i.name}</button>)}
     </div>
    </div>
    <label>Answer type
     <select value={draft.fieldType} onChange={e=>change({fieldType:e.target.value as RequirementType})}>
      <option value="text">Text</option><option value="number">Number</option>
      <option value="select">Select (Dropdown)</option><option value="boolean">Yes / No</option>
     </select>
    </label>
    {draft.fieldType==='select'&&<div className="crf-options">
     <span className="crf-label">Options <b>*</b></span>
     {draft.options.map((option,index)=><div className="crf-option-row" key={index}>
      <span className="crf-drag" aria-hidden="true">⠿</span>
      <input value={option} maxLength={200} aria-label={'Choice '+(index+1)}
       onChange={e=>change({options:draft.options.map((x,i)=>i===index?e.target.value:x)})}/>
      <button aria-label={'Remove choice '+(index+1)} type="button"
       onClick={()=>change({options:draft.options.filter((_,i)=>i!==index)})}><Glyph name="trash" size={17}/></button>
     </div>)}
     <button type="button" className="crf-add-option"
      disabled={draft.options.length>=100} onClick={()=>change({options:[...draft.options,'']})}>
      <Glyph name="plus" size={17}/> Add option</button>
    </div>}
    <div className="crf-switch-row">
     <div><strong>Required field</strong><small>Make this answer mandatory when editing a lead.</small></div>
     <label className="crf-switch"><input type="checkbox" checked={draft.required}
      onChange={e=>change({required:e.target.checked})} aria-label="Required field"/>
      <span/></label>
    </div>
    <div className="crf-switch-row">
     <div><strong>Active field</strong><small>Show this question in lead forms.</small></div>
     <label className="crf-switch"><input type="checkbox" checked={draft.active}
      onChange={e=>change({active:e.target.checked})} aria-label="Active field"/>
      <span/></label>
    </div>
    <label className="crf-order-field">Display order
     <input type="number" min="0" max="10000" step="1" value={draft.sortOrder}
      onChange={e=>change({sortOrder:Number(e.target.value)})}/>
     <small>Smaller numbers appear earlier in the lead form.</small>
    </label>
    <section className="crf-preview">
     <div className="crf-preview-title"><Glyph name="eye" size={19}/><div>
      <strong>Lead form preview</strong><small>This is how this question appears in the lead form.</small>
     </div></div>
     <label>{draft.name||'Your question'}{draft.required&&<b> *</b>}
      {draft.fieldType==='select'?<select disabled defaultValue=""><option value="">Select an option</option>
        {draft.options.filter(Boolean).map((x,i)=><option key={i}>{x}</option>)}</select>:
       draft.fieldType==='boolean'?<select disabled><option>Select Yes or No</option><option>Yes</option><option>No</option></select>:
       <input disabled type={draft.fieldType==='number'?'number':'text'}
        placeholder={draft.fieldType==='number'?'Enter number':'Enter your answer'}/>}
     </label>
    </section>
    {feedback&&<p className="crf-feedback" role="status">{feedback}</p>}
   </div>
   <div className="crf-editor-actions">
    <button type="button" disabled={busy} onClick={()=>{setEditing(null);setFeedback('');}}>Cancel</button>
    <button type="button" disabled={busy||!canManage} onClick={()=>void save()}>
     {busy?'Saving…':'Save Field'}</button>
   </div>
  </>}
 </div>;
}
