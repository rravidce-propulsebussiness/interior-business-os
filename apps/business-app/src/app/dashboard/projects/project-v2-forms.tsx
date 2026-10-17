'use client';
import { useActionState, useTransition, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { saveProjectSite, uploadProjectSiteMedia } from './[id]/site/actions';
import { syncConstructionFromProjectAgreement, assignConstructionRole } from './[id]/site/construction-actions';
import { recordSignedAgreement } from './[id]/site/agreement-actions';

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
export function ProjectLifecycle({id,stage,canManage,designs}:{
 id:string;stage:string;canManage:boolean;designs:{id:string;kind:string;status:string}[];
}){
 if(!canManage)return null;
 if(stage==='not_started')return <section className="pv2-panel pv2-lifecycle">
  <h2>Start project delivery</h2><p>Initialize the existing project delivery workspace. This does not create another project.</p>
  <InitializeSite id={id}/>
 </section>;
 if(stage==='design')return <section className="pv2-panel pv2-lifecycle">
  <h2>Design Review & Client Confirmation</h2>
  <p>Review the latest plan revisions before recording client acknowledgement.</p>
  {designs.filter(x=>x.status==='submitted').map(x=><details className="pv2-edit-drawer" key={x.id}>
   <summary>Review {x.kind.replaceAll('_',' ')}</summary>
   <ProjectForm projectId={id} operation="design_decide" label="Save design review">
    <input type="hidden" name="id" value={x.id}/>
    <label>Decision<select name="decision"><option value="approved">Approve</option>
     <option value="changes_requested">Request changes</option></select></label>
    <label>Review note<textarea name="note" rows={2}/></label>
   </ProjectForm>
  </details>)}
  <details className="pv2-edit-drawer"><summary>Record client design confirmation</summary>
   <ProjectForm projectId={id} operation="client_approve" label="Record client confirmation">
    <label>Confirmation evidence<textarea name="evidence" required minLength={10} maxLength={3000}
     placeholder="Client approval reference, date and communication or signed reference"/></label>
    <p className="pv2-hint">A manager-recorded confirmation is not a verified digital customer signature.</p>
   </ProjectForm>
  </details>
 </section>;
 if(stage==='client_approved')return <section className="pv2-panel pv2-lifecycle">
  <h2>Ready to Begin Execution</h2>
  <p>The latest required designs have been approved. Start the site execution stage when the team is ready.</p>
  <ProjectForm projectId={id} operation="execution_start" label="Start site execution">
   <p className="pv2-hint">Only authorized project managers can start work after client approval.</p>
  </ProjectForm>
 </section>;
 return null;
}
export function SignedAgreementForm({projectId,contractId,media}:{
 projectId:string;contractId:string;media:{id:string;name:string}[];
}){
 const router=useRouter();
 const [state,submit,pending]=useActionState(async(_prev:Result,form:FormData)=>{
  const result=await recordSignedAgreement(projectId,contractId,form);
  if(result.saved)router.refresh();
  return result;
 },initial);
 return <form action={submit} className="pv2-form">
  <label>Uploaded signed agreement PDF<select name="media_id" required defaultValue="">
   <option value="" disabled>Select uploaded agreement</option>
   {media.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
  </select></label>
  <label>Signed agreement evidence<textarea name="note" minLength={12} maxLength={3000}
   rows={2} required placeholder="Who signed, date, and how the signed copy was received"/></label>
  <button className="pv2-button pv2-primary" disabled={pending}>Record signed agreement</button>
  {state.message&&<p role="status" className="pv2-form-feedback">{state.message}</p>}
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
   {['daily','site','inspection','agreement','design','curing'].map(v=>
    <option key={v} value={v}>{v}</option>)}</select></label>
  <label>Caption<input name="caption" maxLength={500} placeholder="Description of photo or file"/></label>
  <p className="pv2-hint">Private file · maximum 8 MB · access limited by project permissions</p>
 </ProjectForm>;
}
export function DesignSubmitForm({id}:{id:string}){
 return <ProjectForm projectId={id} operation="design_submit" label="Submit new revision">
  <label>Design type<select name="kind">
   {['architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan']
    .map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
  <label>Drawing reference<input name="reference" minLength={6} required maxLength={1500}
   placeholder="Drawing number or uploaded file reference"/></label>
  <label>Revision notes<textarea name="notes" rows={2}/></label>
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
