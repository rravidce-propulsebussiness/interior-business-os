'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { saveGstDocument } from './actions';
import type { GstDocument, GstBusinessProfile, GstLine } from '@business-os/database/gst';
import type { GstStageInvoiceContext } from '@business-os/database/gst';
import type { GstInvoiceAppearance } from '@business-os/database/gst-templates';
import type { InvoiceStageChoice } from './stage-choices';
import './premium-sales-invoice.css';

type Props = {
  profile: GstBusinessProfile;
  standard: GstInvoiceAppearance;
  existing: GstDocument | null;
  stageContext: GstStageInvoiceContext | null;
  choices: InvoiceStageChoice[];
  initialLead: string;
};
const blank = (): GstLine => ({
  description: '', hsnSac: '', unit: 'Nos', quantity: 1,
  unitPrice: 0, discount: 0, gstRate: 18,
});
const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);
const dateIndia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const toFinite = (value: number) => Number.isFinite(value) ? value : 0;
const currencyTotal = (line: GstLine) =>
  Math.max(0, toFinite(line.quantity) * toFinite(line.unitPrice) - toFinite(line.discount));

export function PremiumSalesInvoice({
  profile, standard, existing, stageContext, choices, initialLead,
}: Props) {
  const firstLead = choices.find((choice) =>
    choice.leadId === (stageContext?.leadId ?? initialLead));
  const [leadId, setLeadId] = useState(firstLead?.leadId ?? '');
  const choice = choices.find((row) => row.leadId === leadId);
  const initialStage = stageContext?.stageNumber ?? (choice ? 1 : 0);
  const [stageNumber, setStageNumber] = useState(initialStage);
  const stage = choice?.stages.find((row) => row.number === stageNumber);
  const [partyName, setPartyName] = useState(existing?.partyName ?? firstLead?.clientName ?? '');
  const [partyGstin, setPartyGstin] = useState(existing?.partyGstin ?? firstLead?.clientGstin ?? '');
  const [partyState, setPartyState] = useState(existing?.partyState ?? firstLead?.clientState ?? profile.stateCode);
  const [partyAddress, setPartyAddress] = useState(existing?.partyAddress ?? firstLead?.clientAddress ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState(existing?.deliveryAddress ?? '');
  const [type, setType] = useState<GstDocument['documentType']>(
    existing?.documentType ?? 'tax_invoice');
  const [date, setDate] = useState(existing?.date ?? dateIndia());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(existing?.placeOfSupply ?? firstLead?.clientState ?? profile.stateCode);
  const [reverseCharge, setReverseCharge] = useState(existing?.reverseCharge ?? false);
  const [lines, setLines] = useState<GstLine[]>(() => {
    if (existing?.lines?.length) return existing.lines.map((line) => ({ ...line }));
    const selected = firstLead?.stages.find((row) => row.number === initialStage);
    return selected ? [{ ...blank(), description: 'Stage payment - ' + selected.name,
      unitPrice: selected.amount, quantity: 1, discount: 0 }] : [blank()];
  });
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [preview, setPreview] = useState(false);

  const changeLead = (value: string) => {
    setLeadId(value);
    const selected = choices.find((row) => row.leadId === value);
    setStageNumber(selected ? 1 : 0);
    if (selected) {
      setPartyName(selected.clientName);
      setPartyGstin(selected.clientGstin);
      setPartyAddress(selected.clientAddress);
      setPartyState(selected.clientState);
      setPlaceOfSupply(selected.clientState);
      const first = selected.stages[0];
      if (first) setLines([{ ...blank(), description: 'Stage payment - ' + first.name,
        unitPrice: first.amount }]);
    } else {
      setLines([blank()]);
    }
  };
  const changeStage = (next: number) => {
    setStageNumber(next);
    const chosen = choice?.stages.find((row) => row.number === next);
    if (!chosen) return;
    setLines((before) => {
      const rest = before.slice(1);
      return [{ ...(before[0] ?? blank()), description: 'Stage payment - ' + chosen.name,
        unitPrice: chosen.amount, quantity: 1, discount: 0 }, ...rest];
    });
  };
  const updateLine = (i: number, key: keyof GstLine, value: string) => {
    setLines((before) => before.map((line, index) => index === i ? {
      ...line, [key]: ['quantity','unitPrice','discount','gstRate'].includes(key)
        ? Number(value) : value,
    } : line));
  };
  const amounts = useMemo(() => {
    let subtotal = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
    for (const line of lines) {
      const gross = Math.max(0,toFinite(line.quantity)*toFinite(line.unitPrice));
      const deduction = Math.max(0,toFinite(line.discount));
      const base = Math.max(0,gross-deduction);
      const tax = type === 'tax_invoice'
        ? Math.round((base*toFinite(line.gstRate)/100)*100)/100 : 0;
      subtotal += gross; discount += deduction; taxable += base;
      if (profile.stateCode === placeOfSupply) {
        cgst += Math.round(tax*50)/100; sgst += tax-Math.round(tax*50)/100;
      } else igst += tax;
    }
    return { subtotal, discount, taxable, cgst, sgst, igst,
      grand: taxable+cgst+sgst+igst };
  },[lines,type,placeOfSupply,profile.stateCode]);
  const stageAmount = stage ? currencyTotal(lines[0] ?? blank()) : 0;
  const stageInvalid = !!stage && (stageAmount <= 0 || stageAmount > stage.amount ||
    (lines[0]?.quantity ?? 0) !== 1 || (lines[0]?.discount ?? 0) !== 0);
  const hasStage = Boolean(choice && stage);
  const canSwitchLead = !existing;
  const safeLines = lines.map((line) => ({
    description: line.description, hsnSac: line.hsnSac, unit: line.unit,
    quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount,
    gstRate: type === 'tax_invoice' ? line.gstRate : 0,
  }));
  const disabledSave = stageInvalid || (leadId !== '' && !hasStage) ||
    (stageContext !== null && !hasStage);

  const invoicePreview = (
    <div className="psi-paper">
      <div className="psi-paper-header">
        <div className="psi-paper-logo">⌂</div>
        <div><strong>{profile.legalName}</strong><small>{profile.address}</small>
          <small>{profile.gstin ? 'GSTIN: '+profile.gstin : 'GSTIN not configured'}</small></div>
        <b>TAX INVOICE</b>
      </div>
      <div className="psi-paper-bill">
        <div><span>BILL TO</span><strong>{partyName || 'Customer name'}</strong>
          <small>{partyAddress || 'Address not entered'}</small>
          <small>{partyGstin ? 'GSTIN: '+partyGstin : 'Unregistered customer'}</small></div>
        <div><span>Invoice no.</span><strong>{existing?.number ?? 'On issuance'}</strong>
          <small>Invoice date: {date}</small><small>Due date: {dueDate || '—'}</small></div>
      </div>
      <table className="psi-paper-table"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>{lines.map((line,i)=><tr key={i}>
          <td>{line.description || 'Goods / services'}<small>{line.hsnSac || 'HSN / SAC'}</small></td>
          <td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td>{money(currencyTotal(line))}</td>
        </tr>)}</tbody></table>
      <div className="psi-paper-totals">
        <div><span>Taxable value</span><strong>{money(amounts.taxable)}</strong></div>
        {amounts.cgst>0&&<div><span>CGST</span><strong>{money(amounts.cgst)}</strong></div>}
        {amounts.sgst>0&&<div><span>SGST</span><strong>{money(amounts.sgst)}</strong></div>}
        {amounts.igst>0&&<div><span>IGST</span><strong>{money(amounts.igst)}</strong></div>}
        <div className="psi-paper-grand"><span>Estimated total</span><strong>{money(amounts.grand)}</strong></div>
      </div>
    </div>
  );

  return <form action={saveGstDocument} className="psi-shell">
    {existing && <><input type="hidden" name="id" value={existing.id}/>
      <input type="hidden" name="version" value={existing.version}/></>}
    <input type="hidden" name="kind" value="sales_invoice"/>
    <input type="hidden" name="linesJson" value={JSON.stringify(safeLines)}/>
    {hasStage && <><input type="hidden" name="leadId" value={choice!.leadId}/>
      <input type="hidden" name="revisionId" value={choice!.revisionId}/>
      <input type="hidden" name="stageNumber" value={stage!.number}/></>}
    <header className="psi-top">
      <div><div className="psi-breadcrumb"><Link href="/dashboard/billing">Billing</Link>
        <span>/</span><span>Sales invoices</span><span>/</span><b>{existing ? 'Edit draft' : 'New invoice'}</b></div>
        <h1>Create sales invoice <span className="psi-draft">Draft</span></h1>
        <p>Choose your client, select one approved quotation stage and prepare an invoice.</p>
      </div>
      <div className="psi-header-actions"><Link href="/dashboard/billing" className="psi-muted-button">Cancel</Link>
        <button type="button" className="psi-outline-button" onClick={()=>setPreview(true)}>Preview invoice</button>
        <button type="submit" className="psi-orange-button" disabled={disabledSave}>Save &amp; preview</button></div>
    </header>
    <div className="psi-columns">
      <div className="psi-left">
        <section className="psi-card">
          <div className="psi-title"><span className="psi-step">1</span><h2>Select client &amp; project</h2></div>
          <div className="psi-fields">
            <label className="psi-field psi-wide"><span>Client from lead / quotation</span>
              <select value={leadId} onChange={e=>changeLead(e.target.value)} disabled={!canSwitchLead}>
                <option value="">Manual customer / one-time invoice</option>
                {choices.map(row=><option key={row.leadId} value={row.leadId}>{row.clientName} · {row.leadNumber} · {row.quoteNumber}</option>)}
              </select></label>
          </div>
          {hasStage && <div className="psi-attached">
            <span className="psi-check">✓</span><div><strong>{choice!.projectName}</strong>
              <p>Accepted quote {choice!.quoteNumber} · {choice!.projectType || 'Project'}</p>
              <small>On the first issued invoice, this existing quotation project becomes active. Saving a draft does not create it.</small></div>
            </div>}
          {!hasStage && <p className="psi-hint">Stage payment invoicing requires a won lead with an accepted quotation and a saved payment plan. Other sales invoices can still be prepared manually.</p>}
          <div className="psi-fields psi-party-fields">
            <label className="psi-field"><span>Client / company name *</span>
              <input required name="partyName" minLength={2} maxLength={200} value={partyName}
                onChange={e=>setPartyName(e.target.value)}/></label>
            <label className="psi-field"><span>GSTIN (optional)</span>
              <input name="partyGstin" maxLength={15} value={partyGstin} placeholder="36ABCDE1234F1Z5"
                onChange={e=>setPartyGstin(e.target.value.toUpperCase())}/></label>
            <label className="psi-field"><span>Recipient state code *</span>
              <input required name="partyState" pattern="[0-9]{2}" maxLength={2} value={partyState}
                onChange={e=>setPartyState(e.target.value)}/></label>
            <label className="psi-field psi-wide"><span>Billing address</span>
              <textarea name="partyAddress" rows={2} maxLength={1000} value={partyAddress}
                onChange={e=>setPartyAddress(e.target.value)}/></label>
            <details className="psi-wide psi-more"><summary>Different delivery address (optional)</summary>
              <textarea name="deliveryAddress" rows={2} maxLength={1000} value={deliveryAddress}
                onChange={e=>setDeliveryAddress(e.target.value)}/></details>
          </div>
        </section>
        <section className="psi-card">
          <div className="psi-title"><span className="psi-step">2</span><h2>Invoice details</h2></div>
          <div className="psi-fields psi-four">
            <label className="psi-field"><span>Invoice type</span><select name="documentType" value={type}
              onChange={e=>setType(e.target.value as GstDocument['documentType'])}>
              <option value="tax_invoice">Tax invoice</option><option value="bill_of_supply">Bill of supply</option>
              <option value="commercial_invoice">Commercial invoice</option></select></label>
            <label className="psi-field"><span>Invoice date</span><input required type="date" name="date" value={date}
              onChange={e=>setDate(e.target.value)}/></label>
            <label className="psi-field"><span>Due date</span><input type="date" name="dueDate" value={dueDate}
              onChange={e=>setDueDate(e.target.value)}/></label>
            <label className="psi-field"><span>Place of supply (state code)</span><input required name="placeOfSupply"
              pattern="[0-9]{2}" maxLength={2} value={placeOfSupply}
              onChange={e=>setPlaceOfSupply(e.target.value)}/></label>
          </div>
          <label className="psi-toggle"><input type="checkbox" name="reverseCharge" value="true" checked={reverseCharge}
            onChange={e=>setReverseCharge(e.target.checked)}/> Reverse charge applies</label>
        </section>
        {hasStage && <section className="psi-card">
          <div className="psi-title"><span className="psi-step">3</span><h2>Select project stage &amp; payment</h2></div>
          <div className="psi-fields psi-three">
            <label className="psi-field"><span>Payment stage</span><select aria-label="Payment stage"
              value={stageNumber} onChange={e=>changeStage(Number(e.target.value))} disabled={!!existing}>
              {choice!.stages.map(row=><option key={row.number} value={row.number}>
                {row.number}. {row.name} ({row.percent}%)
              </option>)}</select></label>
            <div className="psi-field"><span>Scheduled percentage</span><output className="psi-readonly">{stage!.percent}%</output></div>
            <label className="psi-field"><span>Stage amount (₹)</span>
              <input aria-label="Stage amount" type="number" min="0.01" max={stage!.amount}
                step="0.01" value={lines[0]?.unitPrice ?? 0}
                onChange={e=>updateLine(0,'unitPrice',e.target.value)}/></label>
          </div>
          <p className="psi-hint">Suggested from the saved quotation ({money(choice!.quoteTotal)}). Partial stage billing is allowed up to {money(stage!.amount)} before applicable GST.</p>
          {stageInvalid && <p className="psi-alert" role="alert">Stage billing amount must be above zero and cannot exceed the agreed stage amount.</p>}
        </section>}
        <section className="psi-card">
          <div className="psi-title psi-title-between"><div><span className="psi-step">{hasStage?4:3}</span>
            <h2>Items &amp; services</h2></div><button className="psi-add" type="button" disabled={lines.length>=50}
            onClick={()=>setLines(prev=>[...prev,blank()])}>＋ Add item</button></div>
          <div className="psi-table-wrap"><table className="psi-items-table"><thead><tr>
            <th>Item / description</th><th>HSN / SAC</th><th>Qty</th><th>Unit</th>
            <th>Rate (₹)</th><th>Discount</th><th>GST %</th><th>Amount</th><th/>
          </tr></thead><tbody>{lines.map((line,index)=><tr key={index}>
            <td><label className="psi-cell-mobile">Description</label><input aria-label={'Item description '+(index+1)}
              required maxLength={500} value={line.description}
              readOnly={hasStage&&index===0}
              onChange={e=>updateLine(index,'description',e.target.value)}/></td>
            <td><label className="psi-cell-mobile">HSN / SAC</label><input required maxLength={12} placeholder="HSN / SAC"
              aria-label={'HSN or SAC '+(index+1)} value={line.hsnSac}
              onChange={e=>updateLine(index,'hsnSac',e.target.value)}/></td>
            <td><label className="psi-cell-mobile">Qty</label><input type="number" min="0.001" step="0.001" required
              aria-label={'Quantity '+(index+1)} value={line.quantity} readOnly={hasStage&&index===0}
              onChange={e=>updateLine(index,'quantity',e.target.value)}/></td>
            <td><label className="psi-cell-mobile">Unit</label><input required maxLength={24} value={line.unit}
              aria-label={'Unit '+(index+1)} onChange={e=>updateLine(index,'unit',e.target.value)}/></td>
            <td><label className="psi-cell-mobile">Rate</label><input type="number" required min="0" step="0.01"
              aria-label={'Rate '+(index+1)} value={line.unitPrice} readOnly={hasStage&&index===0}
              onChange={e=>updateLine(index,'unitPrice',e.target.value)}/></td>
            <td><label className="psi-cell-mobile">Discount</label><input type="number" min="0" step="0.01"
              aria-label={'Discount '+(index+1)} value={line.discount}
              readOnly={hasStage&&index===0} onChange={e=>updateLine(index,'discount',e.target.value)}/></td>
            <td><label className="psi-cell-mobile">GST %</label><input type="number" required min="0" max="40" step="0.01"
              aria-label={'GST percentage '+(index+1)}
              disabled={type!=='tax_invoice'} value={type==='tax_invoice'?line.gstRate:0}
              onChange={e=>updateLine(index,'gstRate',e.target.value)}/></td>
            <td className="psi-money"><span className="psi-cell-mobile">Amount</span>{money(currencyTotal(line))}</td>
            <td><button aria-label={'Remove item '+(index+1)} type="button" className="psi-remove"
              disabled={lines.length===1||(hasStage&&index===0)}
              onClick={()=>setLines(all=>all.filter((_,j)=>j!==index))>×</button></td>
          </tr>)}</tbody></table></div>
          <p className="psi-hint">Use correct HSN/SAC and GST rates for each supply. The server calculates final taxes when saving.</p>
        </section>
        <section className="psi-card">
          <div className="psi-title"><span className="psi-step">{hasStage?5:4}</span><h2>Notes &amp; terms</h2></div>
          <textarea className="psi-notes" name="notes" maxLength={2000} rows={3} value={notes}
            placeholder="Additional invoice notes..." onChange={e=>setNotes(e.target.value)}/>
        </section>
      </div>
      <aside className="psi-right">
        <section className="psi-card psi-summary">
          <div className="psi-title psi-title-between"><h2>Invoice summary</h2><span className="psi-standard">{standard.name}</span></div>
          {invoicePreview}
          <div className="psi-math">
            <div><span>Subtotal</span><b>{money(amounts.subtotal)}</b></div>
            <div><span>Discount</span><b>- {money(amounts.discount)}</b></div>
            {type==='tax_invoice' && (profile.stateCode===placeOfSupply ? <>
              <div><span>CGST</span><b>{money(amounts.cgst)}</b></div>
              <div><span>SGST</span><b>{money(amounts.sgst)}</b></div>
            </>:<div><span>IGST</span><b>{money(amounts.igst)}</b></div>)}
            <div className="psi-grand"><span>Estimated grand total</span><b>{money(amounts.grand)}</b></div>
          </div>
          {hasStage && <div className="psi-project-note">
            <strong>Project activates after invoice issuance</strong>
            <p>Quote: {choice!.quoteNumber} · Stage: {stage!.name}. Drafts never start execution or record payment.</p>
          </div>}
          <button className="psi-orange-button psi-full" disabled={disabledSave} type="submit">Save &amp; preview</button>
          <p className="psi-hint psi-centered">After saving, review the official draft and choose <b>Issue sales invoice</b>. Final issuance assigns the number and activates the linked project.</p>
        </section>
      </aside>
    </div>
    <div className="psi-mobile-actions">
      <button type="button" onClick={()=>setPreview(true)} className="psi-outline-button">Preview</button>
      <button type="submit" disabled={disabledSave} className="psi-orange-button">Save draft</button>
    </div>
    {preview && <div className="psi-modal-backdrop" role="presentation" onMouseDown={()=>setPreview(false)}>
      <section role="dialog" aria-modal="true" aria-label="Invoice preview" className="psi-modal"
        onMouseDown={event=>event.stopPropagation()}>
        <div className="psi-modal-head"><strong>Preview — unsaved invoice</strong>
          <button type="button" onClick={()=>setPreview(false)} aria-label="Close preview">×</button></div>
        {invoicePreview}
        <p className="psi-hint">This is a local estimate only. Save the draft to view the authoritative server-calculated invoice.</p>
      </section>
    </div>}
  </form>;
}
