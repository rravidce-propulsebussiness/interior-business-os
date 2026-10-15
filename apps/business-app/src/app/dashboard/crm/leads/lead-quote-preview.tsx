'use client';

import { useRef } from 'react';

export function LeadQuotePreview({
  revisionId, number, status, amount, shared = false,
}: {
  revisionId:string; number:string; status:string|null;
  amount:string|null; shared?:boolean;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const base='/dashboard/quotations/'+encodeURIComponent(revisionId);
  const formatted = amount!==null && Number.isFinite(Number(amount))
    ? '₹'+Number(amount).toLocaleString('en-IN',{maximumFractionDigits:0})
    : null;
  return (
    <div className="crm-quote-summary">
      <div className="crm-quote-summary-top">
        <strong title={number}>{number}</strong>
        <span className={shared?'crm-quote-shared':'crm-quote-status'}>
          {shared?'Shared':(status||'Draft').replaceAll('_',' ')}
        </span>
      </div>
      {formatted && <strong className="crm-quote-amount">{formatted}</strong>}
      <div className="crm-quote-buttons">
        <button type="button" onClick={()=>dialog.current?.showModal()}>Preview</button>
        <a href={base}>Open</a>
      </div>
      <dialog ref={dialog} className="crm-quote-dialog" aria-label={'Quotation preview '+number}>
        <div className="crm-quote-dialog-head">
          <div>
            <strong>{number}</strong>
            <span>{shared?'Shared with customer':'Company quotation'}{formatted?' · '+formatted:''}</span>
          </div>
          <button type="button" onClick={()=>dialog.current?.close()} aria-label="Close quotation preview">×</button>
        </div>
        <iframe src={base+'/preview'} title={'Preview '+number} loading="lazy" />
        <div className="crm-quote-dialog-footer">
          <a href={base+'/pdf?view=1'} target="_blank" rel="noopener noreferrer">View PDF</a>
          <a href={base}>Open quotation</a>
          <button type="button" onClick={()=>dialog.current?.close()}>Close</button>
        </div>
      </dialog>
    </div>
  );
}
