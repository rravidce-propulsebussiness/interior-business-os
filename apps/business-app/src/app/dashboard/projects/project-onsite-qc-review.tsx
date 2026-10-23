'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordOnsiteStageQcItem } from './[id]/site/onsite-qc-actions';

export type QcFinding={
 id:string;stage_id:string;index:number;title:string;decision:string;
 notes:string;photo_id:string;reviewed_by:string;reviewed_at:string;self_review:boolean;
};
type Props={
 projectId:string;stageId:string;stageName:string;topics:string[];
 stageStatus:string;canReview:boolean;canManage:boolean;inspectorAssigned:boolean;isOwner:boolean;
 records:QcFinding[];photos:{id:string;filename:string}[];
 existingChecks:{title:string;photoId:string;status?:string}[];
 topicIndices?:number[];earlyQc?:boolean;
};
type Result={saved:boolean;message:string};

function QcItem({projectId,stageId,index,title,records,photos,fieldPhotoId,
  canReview,stageReady,isOwner}:{
 projectId:string;stageId:string;index:number;title:string;records:QcFinding[];
 photos:{id:string;filename:string}[];fieldPhotoId:string;
 canReview:boolean;stageReady:boolean;isOwner:boolean;
}){
 const router=useRouter();
 const latest=records[0];
 const [decision,setDecision]=useState<'passed'|'failed'>('passed');
 const [photoId,setPhotoId]=useState(latest?.photo_id||fieldPhotoId);
 const [result,submit,pending]=useActionState(async(_previous:Result,form:FormData)=>{
  const res=await recordOnsiteStageQcItem(projectId,stageId,index,form);
  if(res.saved)router.refresh();
  return res;
 },{saved:false,message:''});
 const state=latest?.decision==='passed'?'QC passed':latest?.decision==='failed'?'QC failed · Rework':'Not inspected';
 return <details className={'pv2-qc-item '+(latest?.decision==='failed'?'qc-failed':'')+
  (latest?.decision==='passed'?' qc-passed':'')}>
  <summary className="pv2-qc-item-head">
   <span className="pv2-qc-item-icon" aria-hidden="true">{latest?.decision==='passed'?'✓':latest?.decision==='failed'?'!':'○'}</span>
   <span className="pv2-qc-item-title"><strong>{title}</strong><small>{state}</small></span>
   <span className="pv2-qc-chevron">⌄</span>
  </summary>
  <div className="pv2-qc-item-body">
   {latest&&<p className="pv2-qc-last">
    Last on-site QC: <strong>{latest.decision==='passed'?'Passed':'Failed'}</strong>
    {' · '}{new Date(latest.reviewed_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'numeric',minute:'2-digit'})}
   </p>}
   {latest?.decision==='failed'&&<p className="pv2-qc-failure-note">
    Correction required: {latest.notes}
   </p>}
   {canReview&&stageReady&&<form action={submit} className="pv2-qc-review-form">
    <label>Site QC result
     <select name="decision" value={decision} onChange={e=>setDecision(e.target.value as 'passed'|'failed')}>
      <option value="passed">Pass this QC item</option>
      <option value="failed">Fail — corrective work required</option>
     </select>
    </label>
    <label>Inspection remarks {decision==='failed'||isOwner?'(required)':'(optional)'}
     <textarea name="notes" rows={2} minLength={isOwner?12:decision==='failed'?10:undefined}
      required={isOwner||decision==='failed'} maxLength={2000}
      placeholder={decision==='failed'?'Describe the defect, measurement and correction needed':isOwner?'Describe what you personally verified on site':'Measurements, verification and observations'}/>
    </label>
    <label>Site inspection photograph
     <input type="file" name="file" accept="image/jpeg,image/png,image/webp"/>
    </label>
    {!!photos.length&&<label>Or choose an existing project photograph
     <select name="photo_id" value={photoId} onChange={e=>setPhotoId(e.target.value)}>
      <option value="">Select photo evidence</option>
      {photos.map(photo=><option key={photo.id} value={photo.id}>{photo.filename}</option>)}
     </select>
    </label>}
    {!photos.some(photo=>photo.id===photoId)&&<input type="hidden" name="photo_id" value={photoId}/>}
    {photoId&&<a className="pv2-qc-photo" href={'/dashboard/projects/'+projectId+'/site/media/'+photoId}
     target="_blank" rel="noopener noreferrer">View selected evidence</a>}
    <label className="pv2-qc-visit-confirm">
     <input type="checkbox" name="onsite" value="yes" required/>
     <span>I personally visited the project site and inspected this item.</span>
    </label>
    <button type="submit" className="pv2-button pv2-primary" disabled={pending}>
     {pending?'Recording QC…':decision==='passed'?'Pass QC item':'Fail QC item & request correction'}
    </button>
    {result.message&&<p role="status" className={'pv2-form-feedback '+(result.saved?'good':'bad')}>{result.message}</p>}
   </form>}
   {!stageReady&&latest?.decision==='failed'&&<p className="pv2-hint">
    Site engineer must correct this item, re-pass its site check and submit the stage for QC again.
   </p>}
   {records.length>0&&<details className="pv2-qc-history">
    <summary>Inspection history ({records.length})</summary>
    {records.map(item=><div key={item.id} className="pv2-qc-history-line">
     <b>{item.decision==='passed'?'Passed':'Failed'}{item.self_review?' · Owner self-QC':''}</b>
     <small>{new Date(item.reviewed_at).toLocaleDateString('en-IN')}</small>
     <span>{item.notes||'No additional remarks'}</span>
     <a href={'/dashboard/projects/'+projectId+'/site/media/'+item.photo_id}
       target="_blank" rel="noopener noreferrer">View photo</a>
    </div>)}
   </details>}
  </div>
 </details>;
}
export function StageOnsiteQcReview(props:Props){
 const {projectId,stageId,stageName,topics,stageStatus,canReview,canManage,inspectorAssigned,isOwner,
  records,photos,existingChecks,topicIndices,earlyQc=false}=props;
 const indices=topicIndices??topics.map((_,index)=>index);
 const byIndex=(index:number)=>records.filter(record=>record.index===index)
  .sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at)||b.id.localeCompare(a.id));
 const passed=indices.filter(index=>byIndex(index)[0]?.decision==='passed').length;
 const failed=indices.filter(index=>byIndex(index)[0]?.decision==='failed').length;
 const stageReady=stageStatus==='ready_for_qc';
 const earlyReady=earlyQc&&stageStatus==='in_progress'&&indices.some((index,i)=>
  existingChecks.some(check=>check.title.toLowerCase()===topics[i]?.toLowerCase()&&check.status==='passed'));
 if(!topics.length)return null;
 return <details className="pv2-on-site-qc" open={stageReady||earlyReady||failed>0}>
  <summary className="pv2-qc-heading">
   <span className="pv2-qc-heading-icon">✓</span>
   <span><strong>On-site Quality Inspection</strong>
    <small>{stageName} · {isOwner?'Company owner QC':'Assigned company QC inspector'}</small></span>
   <span className="pv2-qc-score">{passed}/{topics.length} QC passed</span>
  </summary>
  <div className="pv2-qc-inner">
   <div className="pv2-qc-metrics">
    <span>Site engineer checks submitted separately</span>
    <b>{failed?failed+' failed · correction required':passed===topics.length?
     'All QC items passed':'QC review: '+(topics.length-passed-failed)+' pending'}</b>
   </div>
   {!inspectorAssigned&&!isOwner&&canManage&&<p className="pv2-qc-help">
    No QC inspector is assigned. Open <a href={'/dashboard/projects/'+projectId+'/team'}>Team & Access</a>
    {' '}and assign one of your company employees as <strong>Quality Inspector</strong>.
   </p>}
   {isOwner&&(stageReady||earlyReady)&&<p className="pv2-qc-help">Owner QC is enabled without assigning another employee. Visit the site and record your inspection photo and verification notes. Self-reviewed checks are identified in the audit history.</p>}
   {!canReview&&(stageReady||earlyReady)&&<p className="pv2-qc-help">
    The assigned company QC inspector must visit the site to record Pass or Fail for each item.
   </p>}
   {!stageReady&&!earlyReady&&<p className="pv2-qc-help">
    {failed?'This stage was reopened for site corrections. Previously passed QC items remain recorded.':
     earlyQc?'Pass the corresponding site check with photo evidence to unlock this QC checkpoint.':
      'QC inspections become editable after the site engineer finishes field work and requests QC.'}
   </p>}
   {topics.map((title,i)=>{const index=indices[i]!;
    const itemReady=stageReady||(earlyQc&&stageStatus==='in_progress'&&existingChecks.some(check=>
      check.title.toLowerCase()===title.toLowerCase()&&check.status==='passed'));
    return <QcItem key={index} projectId={projectId} stageId={stageId}
    index={index} title={title} records={byIndex(index)} canReview={canReview} stageReady={itemReady} isOwner={isOwner}
    photos={photos} fieldPhotoId={existingChecks.find(c=>c.title.toLowerCase()===title.toLowerCase())?.photoId||''}/>;})}
   <p className="pv2-hint">QC Pass/Fail is recorded per item with photo, inspection date and reviewer identity.
    A failed item needs site correction and re-inspection. Formal stage certification and any structural hold points remain protected.</p>
  </div>
 </details>;
}
