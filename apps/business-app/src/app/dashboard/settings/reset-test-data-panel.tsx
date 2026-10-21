'use client';
import { useState,useTransition } from 'react';
import {
 ownerResetTestData,ownerResetTestDataPreview,type ResetPreview,
} from './test-reset-actions';

export function ResetTestDataPanel(){
 const [preview,setPreview]=useState<ResetPreview|null>(null);
 const [open,setOpen]=useState(false);
 const [confirmation,setConfirmation]=useState('');
 const [ack,setAck]=useState(false);
 const [busy,start]=useTransition();
 const [error,setError]=useState('');
 const [result,setResult]=useState<{success:boolean;message:string}|null>(null);
 const counts=preview?.counts??{};
 const critical=[
  ['Leads',counts['public.leads']??0],
  ['Quotations',counts['public.quotations']??0],
  ['Projects',counts['public.projects']??0],
  ['Customers',counts['public.customers']??0],
  ['Contracts',counts['public.contracts']??0],
  ['Invoices & GST bills',(counts['public.invoices']??0)+
   (counts['private.gst_business_documents']??0)],
  ['Recorded payments',counts['public.payments']??0],
 ] as const;
 const ready=!!preview&&confirmation===preview.required_phrase&&ack
  &&!busy&&!result?.success;
 const toggle=()=>{
  if(open){setOpen(false);return;}
  setOpen(true);
  setPreview(null);
  setError('');
  setResult(null);
  setAck(false);
  setConfirmation('');
  start(async()=>{
   const response=await ownerResetTestDataPreview();
   if(response.success){setPreview(response.preview);return;}
   setError(response.message);
  });
 };
 return <section className="us-card us-reset">
  <div className="us-card-heading"><span className="us-card-icon">↻</span>
   <div><h2>Reset Test Data</h2>
    <p>Clear test leads, quotations, customers, projects, agreements,
      site execution, procurement and Finance records from this company only.</p>
   </div></div>
  <p className="us-reset-note">
   This is permanent. Your login, company identity, employees, roles,
   subscription, branding, packages, website configuration and audit log remain.
   Uploaded media in external cloud storage are <strong>not deleted</strong>.
  </p>
  <button type="button" className="us-reset-open" disabled={busy||result?.success===true}
   onClick={toggle}>{busy?'Checking records…':open?'Close reset preview':'Preview test data reset'}</button>
  {open&&<div className="us-reset-details">
   {busy&&!preview&&<p role="status">Checking linked test records for this company…</p>}
   {error&&<p role="alert" className="us-reset-result bad">{error}
    {' '}Close and reopen the preview to retry.</p>}
   {preview&&<>
    <p><strong>Company:</strong> {preview.company}</p>
    <p><strong>Operational rows to delete:</strong> {preview.total.toLocaleString('en-IN')}</p>
    <div className="us-reset-counts">{critical.map(([name,n])=>
     <div key={name}><span>{name}</span><strong>{n}</strong></div>)}</div>
    <p className="us-reset-note">The total also includes related tasks, quotation
      revisions, schedules, receipts, project evidence and linked records.
      This is not a reset of company settings or cloud file storage.
      Do not use after genuine customer invoices or financial transactions.</p>
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
       if(response.success){setAck(false);setConfirmation('');setPreview(null);}
     })}>{busy?'Resetting…':'Permanently reset test data'}</button>
   </>}
  </div>}
  {result&&<p role="status" className={'us-reset-result '+(result.success?'ok':'bad')}>
   {result.message}
   {!result.success&&' Close and reopen the preview to retry.'}
  </p>}
 </section>;
}
