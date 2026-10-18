'use client';

import { useActionState,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { createExistingClientProject, type NewCustomerProjectResult } from './customer-project-actions';

const initial:NewCustomerProjectResult={ok:false,message:''};

/** The only company new-project form: one existing CRN, a separate project.
 * New customer enquiries are created through the Leads workspace instead.
 */
export function NewProjectForCustomer({
 customers,initialCustomerId='',
}:{
 customers:{id:string;name:string}[];initialCustomerId?:string;
}){
 const router=useRouter();
 const [expanded,setExpanded]=useState(false);
 const [customerId,setCustomerId]=useState(initialCustomerId||customers[0]?.id||'');
 const requestId=useRef<string|null>(null);
 const [state,submit,pending]=useActionState(async(_prev:NewCustomerProjectResult,form:FormData)=>{
  const selected=String(form.get('customer_id')||'');
  if(!customers.some(c=>c.id===selected))
   return {ok:false,message:'Select an existing customer from your company.'};
  if(!requestId.current)requestId.current=crypto.randomUUID();
  form.set('requestId',requestId.current);
  const result=await createExistingClientProject(selected,form);
  if(result.ok&&result.projectId)router.push('/dashboard/projects/'+result.projectId);
  return result;
 },initial);
 if(!customers.length)return <a href="/dashboard/crm/leads" className="pv2-button pv2-primary">New customer? Start from Leads</a>;
 return <div className="pv2-new-project">
  <button type="button" className="pv2-button pv2-primary" aria-expanded={expanded}
   onClick={()=>setExpanded(!expanded)}>{expanded?'Close':'＋ New Project'}</button>
  {expanded&&<section className="pv2-new-project-panel" aria-label="Create project for existing customer">
   <h2>New project</h2>
   <p className="pv2-muted">Use the existing customer record. Each home, renovation or interior job has its own quotation, agreement and timeline.</p>
   <form action={submit} className="pv2-new-project-form">
    <label>Customer
     <select name="customer_id" required value={customerId}
      onChange={e=>{setCustomerId(e.target.value);requestId.current=null}}>
      {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select>
    </label>
    <label>Project name<input name="name" required minLength={3} maxLength={200}
      placeholder="e.g. Ramya – Interior Design"/></label>
    <label>Service
     <select name="industry" defaultValue="construction"><option value="construction">Construction</option><option value="interior">Interior Design</option></select>
    </label>
    <label>Project type
     <select name="type" defaultValue="Residential">
      {['Residential','Commercial','Renovation','Extension','Apartment','Villa','Office'].map(t=><option key={t}>{t}</option>)}
     </select>
    </label>
    <label>Site city<input name="city" required minLength={2} maxLength={200} placeholder="Hyderabad"/></label>
    <div className="pv2-new-project-footer">
     <a href="/dashboard/crm/leads">New customer? Create a lead first</a>
     <button type="submit" disabled={pending} className="pv2-button pv2-primary">
      {pending?'Creating…':'Create & open project'}</button>
    </div>
    {state.message&&<p role="status" className={'pv2-form-feedback '+(state.ok?'good':'bad')}>{state.message}</p>}
   </form>
  </section>}
 </div>;
}
