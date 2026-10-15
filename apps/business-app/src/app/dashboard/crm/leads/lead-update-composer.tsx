'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { logLeadUpdate } from './lead-update-actions';

const types = [
  {value:'phone_call',label:'Phone call'},
  {value:'whatsapp_note',label:'WhatsApp'},
  {value:'meeting',label:'Meeting'},
  {value:'email_note',label:'Email'},
  {value:'note',label:'Other update'},
] as const;
const outcomes = [
  'Call not picked','Spoke with customer','Callback requested',
  'Interested','Needs quotation','Customer requested changes',
  'Not interested','Follow-up scheduled','Other',
];

export function LeadUpdateComposer({
  leadId, leadName, canFollowUp, inline = false,
}: {
  leadId: string; leadName: string; canFollowUp: boolean; inline?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router=useRouter();
  const [type,setType]=useState<(typeof types)[number]['value']>('phone_call');
  const [outcome,setOutcome]=useState('Call not picked');
  const [note,setNote]=useState('');
  const [next,setNext]=useState('');
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  const save=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if (!outcome.trim()) return;
    setBusy(true);setFeedback('');
    try {
      const date=next?new Date(next):null;
      if (date && (!Number.isFinite(date.getTime())||date.getTime()<=Date.now())) {
        setFeedback('Choose a future follow-up date.');return;
      }
      const result=await logLeadUpdate({
        leadId, activityType:type, outcome, note,
        nextFollowUpAt:date?.toISOString()??null,
      });
      setFeedback(result.message);
      if(result.ok){
        setNote('');setNext('');dialog.current?.close();
        router.refresh();
      }
    } catch {setFeedback('Unable to save. Please try again.');}
    finally {setBusy(false);}
  };
  const form=(
    <form onSubmit={save} className="crm-update-form">
      <div className="crm-update-form-heading">
        <h3>Record latest conversation</h3>
        <p>Every update is added to History and appears on the Leads page.</p>
      </div>
      <div className="crm-update-type-tabs">
        {types.map(t=><button type="button" key={t.value}
          aria-pressed={type===t.value}
          className={type===t.value?'active':''}
          onClick={()=>setType(t.value)}>{t.label}</button>)}
      </div>
      <label>Outcome
        <select value={outcome} onChange={(e)=>setOutcome(e.target.value)}>
          {outcomes.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <label>What did the customer say?
        <textarea value={note} onChange={(e)=>setNote(e.target.value)}
          maxLength={3000} rows={3} placeholder="Example: No answer today; customer requested a call on Sunday." />
      </label>
      {canFollowUp && <label>Next follow-up (optional)
        <input type="datetime-local" value={next} onChange={(e)=>setNext(e.target.value)}/>
      </label>}
      {feedback && <p role="status" className="crm-update-feedback">{feedback}</p>}
      <div className="crm-update-buttons">
        {!inline && <button type="button" className="crm-update-cancel" onClick={()=>dialog.current?.close()}>Cancel</button>}
        <button type="submit" className="crm-update-save" disabled={busy||!outcome.trim()}>
          {busy?'Saving…':'Save update'}
        </button>
      </div>
    </form>
  );
  return inline ? (
    <section className="crm-update-inline">{form}</section>
  ) : (
    <>
      <button type="button" className="crm-update-open" onClick={()=>{setFeedback('');dialog.current?.showModal();}}>
        + Log update
      </button>
      <dialog ref={dialog} aria-label={'Update lead '+leadName} className="crm-update-dialog" onClose={()=>setFeedback('')}>
        <div className="crm-update-dialog-header">
          <strong>{leadName}</strong>
          <button type="button" onClick={()=>dialog.current?.close()} aria-label="Close update form">×</button>
        </div>
        {form}
      </dialog>
    </>
  );
}
