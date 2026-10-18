'use client';

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OwnerIcon } from '../../owner-shell';
import { createExistingClientProject, type NewCustomerProjectResult } from './customer-project-actions';

const initial:NewCustomerProjectResult={ok:false,message:''};

/** A second project belongs to the same CRN and opens the existing Projects OS. */
export function NewClientProject({customerId,city=''}:{customerId:string;city?:string}){
 const router=useRouter();
 const [expanded,setExpanded]=useState(false);
 const requestId=useRef<string|null>(null);
 const [state,submit,pending]=useActionState(async(_prev:NewCustomerProjectResult,form:FormData)=>{
  if(!requestId.current)requestId.current=crypto.randomUUID();
  form.set('requestId',requestId.current);
  const result=await createExistingClientProject(customerId,form);
  if(result.ok&&result.projectId)router.push('/dashboard/projects/'+result.projectId);
  return result;
 },initial);
 return <>
  <button type="button" className="cp-action cp-new-project-button"
   aria-expanded={expanded} aria-controls="cp-new-project-form"
   onClick={()=>setExpanded(!expanded)}>
   <OwnerIcon name="projects" size={18}/> {expanded?'Close new project':'New project'}
  </button>
  {expanded&&<section id="cp-new-project-form" className="cp-new-project-panel"
    aria-label="New project for this client">
   <div className="cp-new-project-heading">
    <div><strong>New project for this client</strong>
     <p>Keep the same customer account. Construction, interiors and additional homes each get their own project.</p>
    </div>
   </div>
   <form action={submit} className="cp-new-project-form">
    <label>Project name
     <input name="name" required minLength={3} maxLength={200} placeholder="e.g. Ramya – Second Home"/>
    </label>
    <label>Service
     <select name="industry" defaultValue="construction">
      <option value="construction">Construction</option>
      <option value="interior">Interior Design</option>
     </select>
    </label>
    <label>Project type
     <select name="type" defaultValue="Residential">
      <option>Residential</option><option>Commercial</option>
      <option>Renovation</option><option>Extension</option>
      <option>Apartment</option><option>Villa</option><option>Office</option>
     </select>
    </label>
    <label>Site city
     <input name="city" defaultValue={city} required minLength={2} maxLength={200}
      placeholder="Hyderabad"/>
    </label>
    <p className="cp-new-project-hint">After creating the project, prepare its quotation and signed agreement before starting execution. Existing projects and quotes remain unchanged.</p>
    <button type="submit" className="cp-new-project-submit" disabled={pending}>
     {pending?'Creating…':'Create & open project'} <OwnerIcon name="arrow-right" size={17}/>
    </button>
    {state.message&&<p role="status" className={'cp-new-project-message '+(state.ok?'good':'bad')}>{state.message}</p>}
   </form>
  </section>}
 </>;
}
