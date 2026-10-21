'use client';
import { useActionState } from 'react';
import { reviewClientPaymentProof,type ProofReviewState } from './payment-proof-actions';

export type SubmittedProof={
 id:string;requestId:string;projectId:string;contractId:string;
 requestNumber:string;amount:number;reference:string;method:string;
 status:string;date:string;projectName:string;reviewNote:string;
 paymentId:string|null;receiptId:string|null;
};
const empty:ProofReviewState={message:'',success:false};
export function PaymentProofReview({
 proof,methods,owner,
}:{proof:SubmittedProof;methods:{id:string;name:string}[];owner:boolean}){
 const [state,action,pending]=useActionState(reviewClientPaymentProof,empty);
 return <article className="fw-panel" style={{marginBlock:10}}>
  <div className="fw-panel-head"><div>
   <strong>{proof.projectName||'Customer project'} · {proof.requestNumber}</strong>
   <p>Customer reports ₹{proof.amount.toLocaleString('en-IN')} paid by {proof.method}</p>
  </div></div>
  <p className="fw-muted">Transaction reference: <strong>{proof.reference}</strong></p>
  <p className="fw-muted">Submitted: {proof.date}</p>
  <a href={'/dashboard/finance/payment-proofs/'+proof.id+'/file'}
    target="_blank" rel="noreferrer" className="fw-payment-more">
    View private screenshot / PDF
  </a>
  {proof.status==='pending'&&!state.success?<form action={action}
    className="fw-payment-inline">
   <input type="hidden" name="proof" value={proof.id}/>
   <label>Verified bank / UPI receiving method
    <select name="method" defaultValue="" disabled={pending}>
     <option value="">Select payment account / method</option>
     {methods.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}
    </select>
   </label>
   <label className="fw-payment-inline">
    <input type="checkbox" name="confirm" disabled={pending}/>
    I verified this exact transaction reference, credited amount and date
    against the bank or UPI statement.
   </label>
   {owner&&<label className="fw-payment-inline">
    <input type="checkbox" name="allowPartial" disabled={pending}/>
    Owner exception: authorize partial milestone payment
   </label>}
   <label>Review note / rejection reason
    <textarea name="note" maxLength={1000} rows={2}
     placeholder="Reason if rejecting; optional for approval" disabled={pending}/>
   </label>
   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
    <button type="submit" name="action" value="approve" disabled={pending||!methods.length}>
     {pending?'Working…':'Approve verified payment'}
    </button>
    <button type="submit" name="action" value="reject" disabled={pending}>
     Reject evidence
    </button>
   </div>
  </form>:
   <p className="fw-muted">Review status: {state.success?state.message:proof.status}</p>}
  {state.message&&<p role="status" className="fw-muted">{state.message}</p>}
 </article>;
}
