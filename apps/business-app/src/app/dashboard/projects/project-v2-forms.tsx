'use client';
import { useActionState, useTransition, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { saveProjectSite, uploadProjectSiteMedia } from './[id]/site/actions';
import { syncConstructionFromProjectAgreement, assignConstructionRole } from './[id]/site/construction-actions';
import { saveSignedAgreement } from './[id]/site/agreement-actions';
import { prepareAgreementFromProjectQuote } from './project-agreement-actions';
import { submitProjectDrawing } from './project-design-actions';

type Result={saved:boolean;message:string};
const initial:Result={saved:false,message:''};
export function ProjectForm({projectId,operation,label,children,media=false}:{
 projectId:string;operation:string;label:string;children:ReactNode;media?:boolean;
}){
 const router=useRouter();
 const [state,action,pending]=useActionState(async(_prev:Result,form:FormData):Promise<Result>=>{
  const result=media?await uploadProjectSiteMedia(projectId,form):
   await saveProjectSite(projectId,operation,form);
  if(result.saved)router.refresh();
  return result;
 },initial);
 return <form action={action} className="pv2-form" encType={undefined}>
  <div className="pv2-form-fields">{children}</div>
  <button className="pv2-button pv2-primary" type="submit" disabled={pending}>{pending?'Saving…':label}</button>
  {state.message&&<p role="status" className={'pv2-form-feedback '+(state.saved?'good':'bad')}>{state.message}</p>}
 </form>;
}
/** Does not claim digital customer acceptance. Signed agreement is uploaded next. */
export function PrepareAgreement({projectId,revisionId}:{projectId:string;revisionId:string}){
 const router=useRouter();
 const [pending,start]=useTransition();
 const [message,setMessage]=useState('');
 const [prepared,setPrepared]=useState(false);
 return <div className="pv2-prepare-agreement">
  <button type="button" disabled={pending||prepared}
   className="pv2-button pv2-primary"
   onClick={()=>start(async()=>{
    const result=await prepareAgreementFromProjectQuote(projectId,revisionId);
    setMessage(result.message);
    if(result.saved){setPrepared(true);router.refresh();}
   })}>
   {pending?'Preparing…':prepared?'Agreement prepared':'Prepare agreement'}
  </button>
  {message&&<p role="status" className={'pv2-form-feedback '+(prepared?'good':'')}>{message}</p>}
 </div>;
}

export function SyncStages({id}:{id:string}){
 const router=useRouter();
 const [pending,start]=useTransition();
 const [message,setMessage]=useState('');
 return <div className="pv2-sync"><button className="pv2-button pv2-primary" disabled={pending} onClick={()=>{
  start(async()=>{const result=await syncConstructionFromProjectAgreement(id);
   setMessage(result.message);if(result.saved)router.refresh();});
 }}> {pending?'Checking quotation…':'Import stages from signed agreement'}</button>
 {message&&<p role="status">{message}</p>}</div>;
}
export function AssignRole({projectId,users}:{projectId:string;users:{id:string;label:string}[]}){
 const router=useRouter();
 const [state,submit,pending]=useActionState(async(_prev:Result,form:FormData):Promise<Result>=>{
  const r=await assignConstructionRole(projectId,form);
  if(r.saved)router.refresh();
  return r;
 },initial);
 return <form action={submit} className="pv2-form">
  <div className="pv2-form-fields pv2-two">
   <label>Team member<select name="user_id" required>
    <option value="">Select employee</option>{users.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}
   </select></label>
   <label>Project role<select name="role" defaultValue="site_engineer">
    {['project_manager','architect','structural_engineer','site_engineer','supervisor',
     'quality_inspector','watchman','procurement','storekeeper','quantity_surveyor','accounts_officer']
     .map(role=><option value={role} key={role}>{role.replaceAll('_',' ')}</option>)}
   </select></label>
  </div>
  <button className="pv2-button pv2-primary" disabled={pending}>Assign to project</button>
  {state.message&&<p role="status" className="pv2-form-feedback">{state.message}</p>}
 </form>;
}
/** Primary next action after recording signed agreement: a floor plan,
 * followed by technical review, structural/3D drawings and final client
 * design confirmation. Not a physical construction authorization. */
export function ProjectDrawingForm({id,kind,label}:{id:string;kind?:string;label:string}){
 const router=useRouter();
 const [state,submit,pending]=useActionState(async(_prev:Result,form:FormData):Promise<Result>=>{
  const result=await submitProjectDrawing(id,form);
  if(result.saved||result.uploaded)router.refresh();
  return result;
 },initial);
 return <form action={submit} className="pv2-form pv2-drawing-form">
  {kind?<input type="hidden" name="kind" value={kind}/>:
   <label>Drawing type<select name="kind" defaultValue="architectural_plan">
    {['architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan']
     .map(k=><option key={k} value={k}>{k.replaceAll('_',' ')}</option>)}
   </select></label>}
  <label>Upload drawing (PDF or image, up to 8 MB)
   <input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp"/>
  </label>
  <label>Drawing number or existing file reference
   <input name="reference" maxLength={1500} placeholder="Optional when uploading a new PDF"/>
  </label>
  <label>Revision notes
   <textarea name="notes" rows={2} maxLength={3000} placeholder="Floor, requested layout and revision details"/>
  </label>
  <p className="pv2-hint">Upload a new drawing or enter its existing reference. The same submission appears in the project drawing history.</p>
  <button className="pv2-button pv2-primary" type="submit" disabled={pending}>
   {pending?'Saving drawing…':label}
  </button>
  {state.message&&<p role="status" className={'pv2-form-feedback '+(state.saved?'good':'bad')}>{state.message}</p>}
 </form>;
}
export function ProjectLifecycle({id,stage,canManage,designs,agreementSigned,industry,executionReady=false}:{
 id:string;stage:string;canManage:boolean;agreementSigned:boolean;industry:string;executionReady?:boolean;
 designs:{id:string;kind:string;status:string}[];
}){
 if(!canManage)return null;
 if(stage==='not_started')return <section className="pv2-panel pv2-lifecycle">
  <h2>Enable project design workspace</h2>
  <p>This project already exists from its approved quotation. Enable its drawing and site registers without creating a second project.</p>
  <InitializeSite id={id}/>
 </section>;
 if(stage==='design'){
  const interior=/interior/i.test(industry);
  const initialKind=interior?'interior_layout':'architectural_plan';
  const required=interior?['interior_layout','3d_design']:['architectural_plan','3d_design','structural_design'];
  const latest=(kind:string)=>designs.find(x=>x.kind===kind);
  const first=latest(initialKind);
  const nextKind=required.find(kind=>kind!==initialKind&&latest(kind)?.status!=='approved');
  const submitted=designs.filter(x=>x.status==='submitted');
  const allApproved=required.every(kind=>latest(kind)?.status==='approved');
  const canSubmitPrimary=!first||first.status==='changes_requested';
  return <section className="pv2-panel pv2-lifecycle pv2-design-workflow">
   <div className="pv2-design-step-head">
    <span className="pv2-design-step-index">01</span>
    <div><h2>{canSubmitPrimary?'Floor Plan Preparation':first?.status==='submitted'?'Floor Plan Under Review':'Floor Plan & Design Revisions'}</h2>
     <p>Prepare the floor plan, review the drawing, and capture the client’s design changes before progressing to structural and 3D plans.</p></div>
   </div>
   {!agreementSigned?<p className="pv2-stage-setup-notice">
    A recorded signed agreement is required before submitting drawings. Open Quote &amp; Agreement to confirm signing.</p>:
    <>
     {canSubmitPrimary?<ProjectDrawingForm id={id} kind={initialKind} label="Submit floor plan for review"/>:
      <p className="pv2-design-step-state">Floor plan: <strong>{first?.status==='approved'?'Technically approved':'Submitted for technical review'}</strong></p>}
     {submitted.map(x=><details className="pv2-edit-drawer" key={x.id}>
      <summary>Review {x.kind.replaceAll('_',' ')} drawing</summary>
      <ProjectForm projectId={id} operation="design_decide" label="Save technical review">
       <input type="hidden" name="id" value={x.id}/>
       <label>Technical decision<select name="decision"><option value="approved">Approve</option>
        <option value="changes_requested">Request changes</option></select></label>
       <label>Review note<textarea name="note" rows={2}/></label>
      </ProjectForm>
     </details>)}
     {first?.status==='approved'&&nextKind&&!submitted.some(x=>x.kind===nextKind)&&
      <div className="pv2-design-next">
       <h3>Next drawing: {nextKind.replaceAll('_',' ')}</h3>
       <ProjectDrawingForm id={id} kind={nextKind} label="Submit next design for review"/>
      </div>}
     {allApproved?<details className="pv2-edit-drawer">
      <summary>Record final client design confirmation</summary>
      <ProjectForm projectId={id} operation="client_approve" label="Record client design confirmation">
       <label>Client confirmation reference<textarea name="evidence" required minLength={10} maxLength={3000}
        placeholder="Date and recorded approval of latest plans"/></label>
       <p className="pv2-hint">A manager-recorded approval is not an authenticated digital signature.</p>
      </ProjectForm>
     </details>:
      <p className="pv2-hint">Client design confirmation becomes available after all required floor plan, structural and 3D revisions pass technical review. Design work may be prepared while financial execution checks remain pending.</p>}
    </>}
  </section>;
 }
 // The backend is the authority for signed current contract, active schedule,
 // actual recorded receipt where required and any owner-authorized exception.
 // Do not present a clickable Start button until Finance reports clearance.
 if(stage==='client_approved')
  return executionReady?<div className="pv2-ready-to-execute">
   <ProjectForm projectId={id} operation="execution_start" label="Start site execution">
    <p className="pv2-hint">Financial clearance confirmed. Start physical work when the site and safety team are ready.</p>
   </ProjectForm>
  </div>:null;
 return null;
}
/** One form handles either a new signed PDF or a previously uploaded copy. */
export function SignedAgreementUploadForm({projectId,contractId,media,recorded=false}:{
 projectId:string;contractId:string;media:{id:string;name:string}[];recorded?:boolean;
}){
 const router=useRouter();
 const [state,submit,pending]=useActionState(async(_prev:Result,form:FormData)=>{
  const result=await saveSignedAgreement(projectId,contractId,form);
  if(result.saved||result.uploaded)router.refresh();
  return result;
 },initial);
 return <form action={submit} className="pv2-form pv2-signed-agreement-form">
  <label>Upload signed agreement PDF
   <input type="file" name="file" accept="application/pdf"/>
  </label>
  {media.length>0&&<label>Or use a signed PDF already uploaded
   <select name="media_id" defaultValue="">
    <option value="">Select existing signed PDF (optional)</option>
    {media.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
   </select>
  </label>}
  <label>Signing details
   <textarea name="note" rows={3} required minLength={12} maxLength={3000}
    placeholder="Who signed, signing date, and how the signed copy was received"/>
  </label>
  <p className="pv2-hint">
   Choose one PDF option only. Select an existing file only if it contains the actual signatures.
   A PDF by itself is not evidence of signing until you save these details.
   Maximum upload size 8 MB.
  </p>
  <button type="submit" className="pv2-button pv2-primary" disabled={pending}>
   {pending?'Saving signed agreement…':recorded?'Save replacement signed agreement':'Save signed agreement'}
  </button>
  {state.message&&<p role="status" className={'pv2-form-feedback '+(state.saved?'good':'bad')}>{state.message}</p>}
 </form>;
}
export function SiteReportForm({id}:{id:string}){
 return <ProjectForm projectId={id} operation="report_add" label="Save daily work update">
  <div className="pv2-two">
   <label>Date<input type="date" name="report_date" required defaultValue={new Date().toISOString().slice(0,10)}/></label>
   <label>Workers on site<input name="worker_count" type="number" min="0" max="10000" defaultValue="0" required/></label>
  </div>
  <label>Today's completed work<textarea name="completed_work" rows={3} required minLength={5}
   placeholder="Example: Column reinforcement, 12 columns completed"/></label>
  <label>Tomorrow's work plan<textarea name="tomorrow_plan" rows={3} required minLength={5}
   placeholder="Example: Begin shuttering and vertical-alignment check"/></label>
  <div className="pv2-two">
   <label>Workers needed tomorrow<input name="tomorrow_workers" type="number" min="0" max="10000"/></label>
   <label>Blockers / delays<input name="blockers" maxLength={2000} placeholder="Optional"/></label>
  </div>
  <div className="pv2-two">
   <label>Checks completed<textarea name="checks_done" rows={2}/></label>
   <label>Checks required<textarea name="checks_required" rows={2}/></label>
  </div>
 </ProjectForm>;
}
export function MaterialRequestForm({id}:{id:string}){
 return <ProjectForm projectId={id} operation="material_add" label="Request material">
  <div className="pv2-two"><label>Material<input required name="item" minLength={2} maxLength={200}
   placeholder="TMT steel 12mm"/></label>
   <label>Quantity<input type="number" required name="quantity" min=".001" step=".001" max="100000000"/></label></div>
  <label>Unit<select name="unit" defaultValue="bags">
   {['bags','kg','ton','MT','pieces','nos','sqft','sqm','cum','cft','liters','loads'].map(u=><option key={u}>{u}</option>)}
  </select></label>
  <label>Need / instructions<textarea name="notes" rows={2} maxLength={3000}/></label>
 </ProjectForm>;
}
export function MaterialUpdateForm({id,material}:{id:string;material:{id:string;status:string}}){
 const next=material.status==='requested'?['approved','rejected']:
  material.status==='approved'?['ordered']:material.status==='ordered'?['received']:[];
 if(!next.length)return null;
 return <details className="pv2-subaction"><summary>Update status</summary>
  <ProjectForm projectId={id} operation="material_update" label="Save material status">
   <input type="hidden" name="id" value={material.id}/>
   <label>Next status<select name="status">{next.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
   <label>Source<select name="source" defaultValue="undecided">
    <option value="undecided">Undecided</option><option value="marketplace">Marketplace</option>
    <option value="outside">Outside supplier</option></select></label>
   <label>Supplier / PO reference<input name="vendor_reference" maxLength={500}/></label>
  </ProjectForm>
 </details>;
}
export function QualityForm({id}:{id:string}){
 return <ProjectForm projectId={id} operation="check_add" label="Add check">
  <label>Inspection title<input name="title" required minLength={3} maxLength={200}
   placeholder="Column steel binding check"/></label>
  <label>Due date<input name="due_date" type="date"/></label>
  <label>Checklist / notes<textarea name="notes" rows={3}/></label>
 </ProjectForm>;
}
export function ReviewCheck({id,checkId}:{id:string;checkId:string}){
 return <details className="pv2-subaction"><summary>Record inspection result</summary>
 <ProjectForm projectId={id} operation="check_update" label="Save result">
  <input type="hidden" name="id" value={checkId}/>
  <label>Decision<select name="status"><option value="passed">Passed</option>
   <option value="failed">Failed</option><option value="recheck">Recheck required</option></select></label>
  <label>Review note<textarea name="notes" rows={2}/></label>
 </ProjectForm></details>;
}
export function SiteMediaForm({id,category='daily'}:{id:string;category?:string}){
 return <ProjectForm projectId={id} operation="upload" label="Upload to project" media>
  <label>File<input required type="file" name="file"
   accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"/></label>
  <label>Category<select name="category" defaultValue={category}>
   {['daily','site','inspection','design','curing'].map(v=>
    <option key={v} value={v}>{v}</option>)}</select></label>
  <label>Caption<input name="caption" maxLength={500} placeholder="Description of photo or file"/></label>
  <p className="pv2-hint">Private file · maximum 8 MB · access limited by project permissions</p>
 </ProjectForm>;
}
export function GateForm({id}:{id:string}){
 return <ProjectForm projectId={id} operation="gate_add" label="Save site entry">
  <label>Entry type<select name="kind">
   {['labour','curing','material_delivery','security_round','visitor'].map(v=>
    <option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
  <label>Description<textarea name="description" minLength={3} required rows={2}/></label>
  <label>Notes<textarea name="notes" rows={2}/></label>
 </ProjectForm>;
}
export function InitializeSite({id}:{id:string}){
 return <ProjectForm projectId={id} operation="initialize" label="Initialize project delivery">
  <p className="pv2-hint">Creates the existing project delivery state, not a duplicate project.</p>
 </ProjectForm>;
}
