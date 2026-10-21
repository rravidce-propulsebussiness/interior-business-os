'use client';
import { useState,useTransition } from 'react';
import { ownerResetTestData,type ResetPreview } from './test-reset-actions';

const count=(p:ResetPreview,key:string)=>p.counts[key]??0;
export function ResetTestDataPanel({
 preview,
}:{preview:ResetPreview|null}){
 const [open,setOpen]=useState(false);
 const [confirmation,setConfirmation]=useState('');
 const [ack,setAck]=useState(false);
 const [busy,start]=useTransition();
 const [result,setResult]=useState<{success:boolean;message:string}|null>(null);
 const critical=[
  ['Leads',count(preview??{counts:{}} as ResetPreview,'public.leads')],
  ['Quotations',count(preview??{counts:{}} as ResetPreview,'public.quotations')],
  ['Projects',count(preview??{counts:{}} as ResetPreview,'public.projects')],
  ['Customers',count(preview??{counts:{}} as ResetPreview,'public.customers')],
  ['Contracts',count(preview??{counts:{}} as ResetPreview,'public.contracts')],
  ['Invoices & GST bills',count(preview??{counts:{}} as ResetPreview,'public.invoices')+
   count(preview??{counts:{}} as ResetPreview,'private.gst_business_documents')],
  ['Recorded payments',count(preview??{counts:{}} as ResetPreview,'public.payments')],
 ];
 const ready=!!preview&&confirmation===preview.required_phrase&&ack&&!busy&&!result?.success;
 return <section className="us-card us-reset">
  <div className="us-card-heading"><span className="us-card-icon">↻</span>
   <div><h2>Reset Test Data</h2>
    <p>Clear test leads, quotations, customers, projects, agreements, site execution, procurement and Finance records from this company only.</p>
   </div></div>
  <p className="us-reset-note">This is permanent. Your login, company identity, employees, roles, subscription, branding, packages, website configuration and audit log remain. Uploaded media files in external cloud storage are <strong>not deleted</strong>.</p>
  {!preview?<p className="us-reset-note">Reset preview is currently unavailable. No deletion can run.</p>:
  <>
   <button type="button" className="us-reset-open" disabled={busy||result?.success===true}
    onClick={()=>setOpen(o=>!o)}>{open?'Close reset preview':'Preview test data reset'}</button>
   {open&&<div className="us-reset-details">
    <p><strong>Company:</strong> {preview.company}</p>
    <p><strong>Operational rows to delete:</strong> {preview.total.toLocaleString('en-IN')}</p>
    <div className="us-reset-counts">{critical.map(([name,n])=>
     <div key={name}><span>{name}</span><strong>{n}</strong></div>)}</div>
    <p className="us-reset-note">The total also includes related tasks, quotation revisions, schedules, receipts, project evidence and linked records. This is not a reset of company settings or cloud file storage. Do not use after genuine customer invoices or financial transactions.</p>
    <label className="us-reset-confirm">
     <span>Type <strong>{preview.required_phrase}</strong> to confirm</span>
     <input autoComplete="off" spellCheck={false} value={confirmation}
      maxLength={220} onChange={e=>setConfirmation(e.target.value)}
      placeholder="RESET Company Name" disabled={busy||result?.success}/>
    </label>
    <label className="us-reset-checkbox"><input type="checkbox" checked={ack}
      onChange={e=>setAck(e.target.checked)} disabled={busy||result?.success}/>
     I understand this permanently erases this company's test business records.
    </label>
    <button type="button" className="us-reset-delete" disabled={!ready}
     onClick={()=>start(async()=>{
       if(!ready||!preview)return;
       const response=await ownerResetTestData({
        signature:preview.signature,phrase:confirmation,
       });
       setResult(response);
       if(response.success){setAck(false);setConfirmation('');}
     })}>{busy?'Resetting…':'Permanently reset test data'}</button>
   </div>}
   {result&&<p role="status" className={'us-reset-result '+(result.success?'ok':'bad')}>
    {result.message}
    {!result.success&&' Refresh this page to get a new preview before trying again.'}
   </p>}
  </>}
 </section>;
}
