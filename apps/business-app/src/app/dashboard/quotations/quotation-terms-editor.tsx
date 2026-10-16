'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { joinQuotationTerms, splitQuotationTerms } from './quotation-terms-format';

type Discount = { kind: 'none' | 'fixed' | 'percentage'; value: string };
type TermsInitial = {
  revision_id: string;
  version: number;
  terms: string;
  valid_until: string;
  customer_notes: string;
  internal_notes: string;
  discount: unknown;
};

export function QuotationTermsEditor({
  initial, editable, canDiscount,
}: {
  initial: TermsInitial;
  editable: boolean;
  canDiscount: boolean;
}) {
  const fields = splitQuotationTerms(initial.terms);
  const [validUntil, setValidUntil] = useState(initial.valid_until);
  const [inclusions, setInclusions] = useState(fields.inclusions);
  const [exclusions, setExclusions] = useState(fields.exclusions);
  const [warranty, setWarranty] = useState(fields.warranty);
  const [additional, setAdditional] = useState(fields.additional);
  const [customerNotes, setCustomerNotes] = useState(initial.customer_notes);
  const [internalNotes, setInternalNotes] = useState(initial.internal_notes);
  const savedDiscount: Discount = (() => {
    const value=initial.discount;
    if(value && typeof value==='object' && !Array.isArray(value)){
      const input=value as Record<string,unknown>;
      if(['none','fixed','percentage'].includes(String(input.kind)) &&
        typeof input.value==='string')
        return {kind:input.kind as Discount['kind'],value:input.value};
    }
    return {kind:'none',value:'0'};
  })();
  const [discount, setDiscount] = useState<Discount>(savedDiscount);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const save = () => {
    if (!editable || pending) return;
    if (!/^\d{4}-\d\d-\d\d$/.test(validUntil) ||
      !Number.isFinite(Date.parse(validUntil))) {
      setMessage('Enter a valid quotation expiry date.');
      return;
    }
    if (customerNotes.length > 10000 || internalNotes.length > 10000) {
      setMessage('Notes exceed the 10,000-character limit.');
      return;
    }
    try {
      joinQuotationTerms({
        inclusions, exclusions, warranty, additional, paymentPlan:fields.paymentPlan,
      });
    } catch (error) {
      setMessage(error instanceof Error?error.message:'Please review the terms.');
      return;
    }
    setMessage('');
    startTransition(async () => {
      try {
        const response=await fetch('/dashboard/quotations/'+initial.revision_id+'/conditions',{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            kind:'terms',validUntil,inclusions,exclusions,warranty,additional,
            customerNotes,internalNotes,
            discount:canDiscount?discount:savedDiscount,
          }),
        });
        const result:unknown=await response.json().catch(()=>null);
        const data=result&&typeof result==='object'
          ?result as {id?:string;message?:string;reference?:string}:null;
        if(!response.ok || !data?.id){
          setMessage((data?.message || 'Could not save quotation terms (HTTP '+response.status+').')+
            (data?.reference?' Reference '+data.reference:''));
          return;
        }
        setMessage(data.message || 'Terms & Inclusions saved to this quotation.');
        router.refresh();
      } catch {
        setMessage('Network error saving quotation conditions. Please try again.');
      }
    });
  };

  const textField = (
    key: string, label: string, helper: string, value: string,
    onChange: (value: string) => void, symbol: string, rows: number,
  ) => (
    <label className="qs-terms-field" htmlFor={'qs-terms-'+key}>
      <span className="qs-terms-field-heading">
        <span className="qs-terms-field-icon" aria-hidden="true">{symbol}</span>
        <span><strong>{label}</strong><small>{helper}</small></span>
      </span>
      <textarea id={'qs-terms-'+key} value={value} rows={rows}
        maxLength={key === 'additional' ? 9000 : 7000}
        disabled={!editable} placeholder={'Enter ' + label.toLowerCase() + '…'}
        onChange={(e) => onChange(e.target.value)}
        className="qs-terms-input qs-terms-textarea"/>
    </label>
  );

  return (
    <section className="qs-terms-workspace" aria-label="Quotation terms and inclusions">
      <header className="qs-terms-heading">
        <div>
          <span className="qs-terms-eyebrow">02 · Quotation conditions</span>
          <h2>Terms &amp; Inclusions</h2>
          <p>Only conditions for this quotation. Company branding and standard
            PDF appearance stay in quotation settings.</p>
        </div>
        <span className="qs-terms-saved">Quote-specific</span>
      </header>

      <div className="qs-terms-grid">
        <label className="qs-terms-field qs-terms-date-card" htmlFor="qs-quote-validity">
          <span className="qs-terms-field-heading">
            <span className="qs-terms-field-icon" aria-hidden="true">◷</span>
            <span><strong>Quotation validity</strong>
              <small>The last date the quoted prices remain valid</small></span>
          </span>
          <input id="qs-quote-validity" type="date" required
            className="qs-terms-input" value={validUntil} disabled={!editable}
            onChange={event=>setValidUntil(event.target.value)}/>
        </label>
        {textField('inclusions', 'Inclusions',
          'What is covered in this quotation', inclusions, setInclusions, '✓', 4)}
        {textField('exclusions', 'Exclusions',
          'Work and materials not included', exclusions, setExclusions, '−', 4)}
        {textField('warranty', 'Warranty',
          'Applicable coverage, duration and conditions', warranty, setWarranty, '◇', 4)}
        <div className="qs-terms-wide">
          {textField('additional','Additional terms',
            'Site conditions, owner responsibilities and special agreements',
            additional,setAdditional,'☷',4)}
        </div>
        <div className="qs-terms-wide">
          {textField('notes','Customer notes',
            'Optional message printed for the client', customerNotes,setCustomerNotes,'✎',3)}
        </div>
      </div>

      <details className="qs-terms-advanced">
        <summary>More quotation options <span aria-hidden="true">⌄</span></summary>
        <div className="qs-terms-advanced-content">
          {textField('internal','Internal notes',
            'Visible to your team only; not printed in customer PDF',
            internalNotes,setInternalNotes,'▤',3)}
          {canDiscount && <div className="qs-terms-discount">
            <label htmlFor="qs-term-discount-kind">Quotation discount</label>
            <div className="qs-terms-discount-row">
              <select id="qs-term-discount-kind" value={discount.kind}
                disabled={!editable}
                onChange={event=>setDiscount(old=>({
                  ...old,kind:event.target.value as Discount['kind'],
                }))}>
                <option value="none">No discount</option>
                <option value="fixed">Fixed amount</option>
                <option value="percentage">Percentage</option>
              </select>
              {discount.kind !== 'none' && <input type="number" min="0" step="0.01"
                aria-label="Discount value" disabled={!editable}
                value={discount.value}
                onChange={event=>setDiscount(old=>({...old,value:event.target.value}))}/>}
            </div>
          </div>}
        </div>
      </details>

      <div className="qs-terms-footer">
        <p><strong>Payment stages are separate.</strong> Edit percentages in the Payment
          Schedule tab. Saving these terms retains the saved stage-wise payment schedule.</p>
        {editable && <button type="button" data-studio-save="files"
          onClick={save} disabled={pending} className="qs-terms-save">
          {pending ? 'Saving conditions…' : 'Save Terms & Inclusions →'}
        </button>}
      </div>
      {message && <p className="qs-terms-message" role="status">{message}</p>}
    </section>
  );
}
