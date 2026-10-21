'use client';

import { useActionState } from 'react';
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
 const [state,submit,pending]=useActionState(async(_previous:Result,form:FormData)=>{
  const result=await saveProjectStageItem({projectId,stageId,kind,index,title},form);
  if(result.saved)router.refresh();
  return result;
 },{saved:false,message:''});
 const finished=status==='completed'||status==='passed';
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
     <input type="file" name="file" accept="image/jpeg,image/png,image/webp"/></label>
    {!photos.length&&!!photoId&&<input type="hidden" name="photo_id" value={photoId}/>}
    {!!photos.length&&<label>Or use a photo already uploaded to this project
     <select name="photo_id" defaultValue={photoId}>
      <option value="">Choose an existing photo (optional)</option>
      {photos.map(p=><option key={p.id} value={p.id}>{p.filename}</option>)}
     </select></label>}
    <label>Update notes (optional)<textarea name="note" rows={2} maxLength={2000}
      placeholder="Measurements, result, location or pending issue" defaultValue={notes??''}/></label>
    <button type="submit" className="pv2-button pv2-primary" disabled={pending}>
     {pending?'Saving…':'Save this item'}</button>
    {state.message&&<p role="status" className={'pv2-form-feedback '+(state.saved?'good':'bad')}>{state.message}</p>}
   </form>:<p className="pv2-hint">Only authorized site engineers or project managers can update this item.</p>}
  </div>
 </details>;
}
