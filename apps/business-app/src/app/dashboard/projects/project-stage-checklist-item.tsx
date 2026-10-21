'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProjectStageItem } from './[id]/site/stage-checklist-actions';

type Result={saved:boolean;message:string};
type Photo={id:string;filename:string};
export function StageChecklistItem({projectId,stageId,kind,index,title,status,notes,photos,
  canEdit=false,photoId=''}:{
  projectId:string;stageId:string;kind:'work'|'check';index:number;title:string;
  status:string;notes?:string;photos:Photo[];canEdit?:boolean;photoId?:string;
}) {
 const router=useRouter();
 const [selectedPhotoId,setSelectedPhotoId]=useState(photoId);
 const [evidenceEdited,setEvidenceEdited]=useState(false);
 const [state,submit,pending]=useActionState(async(_previous:Result,form:FormData)=>{
  const result=await saveProjectStageItem({projectId,stageId,kind,index,title},form);
  setEvidenceEdited(false);
  if(result.saved)router.refresh();
  return result;
 },{saved:false,message:''});
 const finished=status==='completed'||status==='passed';
 const selectedPhoto=photos.find(p=>p.id===selectedPhotoId);
 const previewPhotoId=selectedPhoto?.id || (selectedPhotoId===photoId?photoId:'');
 return <details className={'pv2-item-checklist '+(finished?'is-done':'')}>
  <summary className="pv2-item-checklist-summary">
   <span aria-hidden="true" className="pv2-item-checklist-icon">{finished?'✓':status==='failed'?'!':'○'}</span>
   <span className="pv2-item-checklist-copy"><strong>{title}</strong>
    <small>{finished?'Completed':status==='failed'?'Failed — recheck needed':status==='recheck'?'Recheck required':'Pending'}</small></span>
   <span aria-hidden="true" className="pv2-item-checklist-chevron">⌄</span>
  </summary>
  <div className="pv2-item-checklist-inner">
   {photoId&&<a href={'/dashboard/projects/'+projectId+'/site/media/'+photoId}
     target="_blank" rel="noopener noreferrer" className="pv2-check-photo-link">View recorded photo</a>}
   {notes&&<p className="pv2-hint">{notes}</p>}
   {canEdit?<form action={submit} className="pv2-form">
    <label>Result
     <select name="decision" defaultValue={finished?'reopen':'done'}>
      {!finished&&<option value="done">{kind==='work'?'Complete this work':'Pass this check'}</option>}
      {kind==='check'&&!finished&&<option value="failed">Failed — corrective work required</option>}
      <option value="reopen">{finished?'Reopen this item':'Keep for recheck'}</option>
     </select></label>
    <label>Inspection / work photo {kind==='check'?'(required to pass)':'(optional)'}
     <input type="file" name="file" accept="image/jpeg,image/png,image/webp"
       onChange={()=>setEvidenceEdited(true)}/></label>
    <input type="hidden" name="photo_id" value={selectedPhotoId}/>
    {!!photos.length&&<label>Or reuse an existing project photo
     <select aria-label="Use an existing photo" value={selectedPhotoId}
      onChange={event=>{setSelectedPhotoId(event.target.value);setEvidenceEdited(true);}}>
      <option value="">Choose an existing project photo</option>
      {photoId&&!photos.some(p=>p.id===photoId)&&
       <option value={photoId}>Previously linked inspection photo</option>}
      {photos.map(p=><option key={p.id} value={p.id}>{p.filename}</option>)}
     </select></label>}
    {!!previewPhotoId&&<p className="pv2-check-photo-preview">
     <span>Selected as evidence: {selectedPhoto?.filename || 'Previously linked photo'}</span>
     <a href={'/dashboard/projects/'+projectId+'/site/media/'+previewPhotoId}
      target="_blank" rel="noopener noreferrer">View selected photo</a>
    </p>}
    {kind==='check'&&<p className="pv2-hint">Use a clear photo showing this specific check. Reusing a photo does not approve the check automatically.</p>}
    <label>Update notes (optional)<textarea name="note" rows={2} maxLength={2000}
      placeholder="Measurements, result, location or pending issue" defaultValue={notes??''}/></label>
    <button type="submit" className="pv2-button pv2-primary" disabled={pending}>
     {pending?'Saving…':'Save this item'}</button>
    {!evidenceEdited&&state.message&&<p role="status" className={'pv2-form-feedback '+(state.saved?'good':'bad')}>{state.message}</p>}
   </form>:<p className="pv2-hint">Only authorized site engineers or project managers can update this item.</p>}
  </div>
 </details>;
}
