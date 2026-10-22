'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveConstructionStageExecution } from './[id]/site/stage-execution-actions';
import type { StageExecution } from './project-v2-data';

type Action='start'|'pause'|'resume'|'submit_for_qc'|'reopen';
const names:Record<Action,string>={
 start:'Start stage',pause:'Pause stage',resume:'Resume stage',
 submit_for_qc:'Finish field work · Request QC',reopen:'Reopen work'
};
export function StageActivationControl({projectId,stageId,state,canManage,workCompleted=0,workTotal=0,checksPassed=0,checksTotal=0}:{
 projectId:string;stageId:string;state:StageExecution|undefined;canManage:boolean;
 workCompleted?:number;workTotal?:number;checksPassed?:number;checksTotal?:number;
}){
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 const [message,setMessage]=useState('');
 const [saved,setSaved]=useState(false);
 const status=state?.status??'not_started';
 const blockers=state?.blockers??[];
 const active=['in_progress','on_hold','ready_for_qc'].includes(status);
 const canSubmitForQc=workCompleted===workTotal&&checksPassed===checksTotal;
 if(status==='certified')return <p className="pv2-stage-activation-ok">Stage certified following independent QC.</p>;
 if(!canManage)return active?<p className="pv2-stage-activation-note">
  {status==='ready_for_qc'?'Field work submitted for quality review.':
    status==='on_hold'?'This stage is paused.':'Work is active for this stage.'}</p>:null;
 const actions:Action[]=status==='not_started'?['start']:
  status==='in_progress'?['pause','submit_for_qc']:
  status==='on_hold'?['resume']:status==='ready_for_qc'?['reopen']:[];
 const action=(cmd:Action)=>{
  setMessage('');setSaved(false);
  startTransition(async()=>{
   const result=await saveConstructionStageExecution(projectId,stageId,cmd);
   setMessage(result.message);setSaved(result.saved);
   if(result.saved)router.refresh();
  });
 };
 return <div className="pv2-stage-activation">
  <div className="pv2-stage-activation-head">
   <strong>{status==='not_started'?'Start physical work':
    status==='in_progress'?'Work in progress':
    status==='on_hold'?'Stage paused':
    status==='ready_for_qc'?'Field work finished · QC pending':'Stage execution'}</strong>
   {state?.startedAt&&<small>Started {new Date(state.startedAt).toLocaleDateString('en-IN')}</small>}
  </div>
  {status==='not_started'&&blockers.length>0&&<div className="pv2-stage-activation-blockers">
   <strong>Prerequisites before starting</strong>
   <ul>{blockers.map((block,i)=><li key={i}>{block}</li>)}</ul>
  </div>}
  <div className="pv2-stage-activation-actions">
   {actions.map(cmd=><button key={cmd} className={'pv2-button '+(cmd==='start'||cmd==='resume'?'pv2-primary':'pv2-outline')}
    type="button" disabled={pending||(cmd==='start'&&blockers.length>0)||(cmd==='submit_for_qc'&&!canSubmitForQc)}
    onClick={()=>action(cmd)}>{pending?'Saving…':names[cmd]}</button>)}
  </div>
  {status==='in_progress'&&<p className="pv2-stage-check-progress">
   {workCompleted}/{workTotal} work items · {checksPassed}/{checksTotal} checks passed
   {!canSubmitForQc?' · Finish remaining items to request QC.':' · Ready to submit for formal QC.'}
  </p>}
  {status==='in_progress'&&<p className="pv2-hint">
   Work can proceed alongside other eligible floors. Finish each checklist item and required test before submitting this stage for independent QC.</p>}
  {status==='ready_for_qc'&&<p className="pv2-hint">
   Awaiting independent QC/structural certification. This does not trigger an invoice or mark a payment received.</p>}
  {message&&<p role="status" className={'pv2-form-feedback '+(saved?'good':'bad')}>{message}</p>}
 </div>;
}
