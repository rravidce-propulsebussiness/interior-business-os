'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { saveGstDocument } from './actions';
import { createWonLeadInvoiceProject } from './invoice-project-actions';
import type { GstDocument, GstBusinessProfile, GstLine } from '@business-os/database/gst';
import type { GstStageInvoiceContext } from '@business-os/database/gst';
import type { GstInvoiceAppearance } from '@business-os/database/gst-templates';
import type { InvoiceStageChoice } from './stage-choices';
import type { InvoiceCustomer } from './customer-choices';
import './premium-sales-invoice.css';

type Props = {
  profile: GstBusinessProfile;
  standard: GstInvoiceAppearance;
  existing: GstDocument | null;
  stageContext: GstStageInvoiceContext | null;
  choices: InvoiceStageChoice[];
  customers: InvoiceCustomer[];
  customerAccess: boolean;
  existingCustomerId: string | null;
  existingWonLeadId: string | null;
  initialLead: string;
  canCreateProject: boolean;
  ownerCanAllowPartial: boolean;
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
  profile, standard, existing, stageContext, choices,
  customers, customerAccess, existingCustomerId, existingWonLeadId, initialLead,
  canCreateProject,ownerCanAllowPartial,
}: Props) {
  const firstLead = choices.find((row) =>
    row.leadId === (stageContext?.leadId ?? initialLead));
  const firstWon = customers.find((row) =>
    row.wonLeadId === (existingWonLeadId ?? stageContext?.leadId ?? initialLead));
  const [customerId, setCustomerId] = useState(
    firstWon?.id ?? firstLead?.customerId ?? existingCustomerId ?? '',
  );
  const [leadId, setLeadId] = useState(firstLead?.leadId ?? '');
  const initialStage = stageContext?.stageNumber ?? (firstLead ? 1 : 0);
  const [stageNumber, setStageNumber] = useState(initialStage);
  const selectedClient = customers.find((row) => row.id === customerId);
  const eligibleStages = choices.filter((row) =>
    row.customerId === customerId || row.leadId === selectedClient?.wonLeadId);
  const choice = eligibleStages.find((row) => row.leadId === leadId);
  const stage = choice?.stages.find((row) => row.number === stageNumber);
  const [partyName, setPartyName] = useState(existing?.partyName ?? selectedClient?.name ?? '');
  const [partyGstin, setPartyGstin] = useState(existing?.partyGstin ?? selectedClient?.gstin ?? '');
  const [partyState, setPartyState] = useState(existing?.partyState ?? selectedClient?.stateCode ?? profile.stateCode);
  const [partyAddress, setPartyAddress] = useState(existing?.partyAddress ?? selectedClient?.address ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState(existing?.deliveryAddress ?? '');
  const [type, setType] = useState<GstDocument['documentType']>(
    existing?.documentType ?? (profile.gstin?'tax_invoice':'commercial_invoice'));
  const [nonGstReason,setNonGstReason] = useState(
    existing?.documentType==='bill_of_supply'?'exempt':
    profile.gstin?'non_taxable':'unregistered');
  const [allowPartialStage,setAllowPartialStage] = useState(false);
  const [date, setDate] = useState(existing?.date ?? dateIndia());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(existing?.placeOfSupply ?? selectedClient?.stateCode ?? profile.stateCode);
  const [reverseCharge, setReverseCharge] = useState(existing?.reverseCharge ?? false);
  const [lines, setLines] = useState<GstLine[]>(() => {
    if (existing?.lines?.length) return existing.lines.map((line) => ({ ...line }));
    const selected = firstLead?.stages.find((row) => row.number === initialStage);
    return selected ? [{ ...blank(), description: 'Stage payment - ' + selected.name,
      unitPrice: selected.amount, quantity: 1, discount: 0 }] : [blank()];
  });
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [preview, setPreview] = useState(false);
  const [projectDialog, setProjectDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectPending, setProjectPending] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectLinks, setProjectLinks] = useState<Record<string,{
    projectId:string; customerId?:string;
  }>>({});
  const linkedProject = selectedClient?.wonLeadId
    ? projectLinks[selectedClient.wonLeadId] : undefined;
  const openProjectDialog = () => {
    if (!selectedClient?.wonLeadId) return;
    setProjectError('');
    setProjectName((selectedClient.name + ' project').slice(0,200));
    setProjectDialog(true);
  };
  const createProject = async () => {
    const id = selectedClient?.wonLeadId;
    const name = projectName.trim();
    if (!id || projectPending || name.length < 2 || name.length > 200) return;
    setProjectPending(true);
    setProjectError('');
    try {
      const result = await createWonLeadInvoiceProject({leadId:id,projectName:name});
      if (!result.ok || !result.projectId) {
        setProjectError(result.message || 'Could not create project.');
        return;
      }
      setProjectLinks(before=>({...before,[id]:{
        projectId:result.projectId!,
        ...(result.customerId ? {customerId:result.customerId} : {}),
      }}));
      setProjectDialog(false);
    } catch {
      setProjectError('Unable to create project. Please retry.');
    } finally {
      setProjectPending(false);
    }
  };

  const changeCustomer = (value: string) => {
    setCustomerId(value);
    setLeadId('');
    setStageNumber(0);
    const client = customers.find((row) => row.id === value);
    setPartyName(client?.name ?? '');
    setPartyGstin(client?.gstin ?? '');
    setPartyAddress(client?.address ?? '');
    setPartyState(client?.stateCode ?? profile.stateCode);
    setPlaceOfSupply(client?.stateCode ?? profile.stateCode);
    setLines([blank()]);
  };
  const changeStage = (value: string) => {
    if (!value) {
      setLeadId('');
      setStageNumber(0);
      setLines([blank()]);
      return;
    }
    const [nextLead, nextNumber] = value.split(':');
    const selected = eligibleStages.find((row) => row.leadId === nextLead);
    const nextStage = Number(nextNumber);
    const chosen = selected?.stages.find((row) => row.number === nextStage);
    if (!selected || !chosen) return;
    setLeadId(selected.leadId);
    setStageNumber(chosen.number);
    setLines([{ ...blank(), description: 'Stage payment - ' + chosen.name,
      unitPrice: chosen.amount, quantity: 1, discount: 0 }]);
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
    (!allowPartialStage && Math.abs(stageAmount-stage.amount)>0.009) ||
    (lines[0]?.quantity ?? 0) !== 1 || (lines[0]?.discount ?? 0) !== 0);
  const hasStage = Boolean(choice && stage);
  const canSwitchLead = !existing;
  const safeLines = lines.map((line) => ({
    description: line.description, hsnSac: line.hsnSac, unit: line.unit,
    quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount,
    gstRate: type === 'tax_invoice' ? line.gstRate : 0,
  }));
  const disabledSave = stageInvalid || (leadId !== '' && !hasStage) ||
    (stageContext !== null && !hasStage) ||
    (selectedClient?.fromApprovedQuotation === true && !hasStage);

  const invoicePreview = (
    <div className="psi-paper">
      <div className="psi-paper-header">
        <div className="psi-paper-logo">⌂</div>
        <div><strong>{profile.legalName}</strong><small>{profile.address}</small>
          <small>{profile.gstin ? 'GSTIN: '+profile.gstin : 'GSTIN not configured'}</small></div>
        <b>{type==='tax_invoice'?'GST TAX INVOICE':type==='bill_of_supply'?'BILL OF SUPPLY':'NON-GST COMMERCIAL INVOICE'}</b>
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
        <div><span>{type==='tax_invoice'?'Taxable value':'Value of supply'}</span><strong>{money(amounts.taxable)}</strong></div>
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
    {type!=='tax_invoice'&&<input type="hidden" name="nonGstReason" value={nonGstReason}/>}
    {hasStage&&<input type="hidden" name="allowPartialStage" value={allowPartialStage?'true':'false'}/>}
    <input type="hidden" name="linesJson" value={JSON.stringify(safeLines)}/>
    {customerId && !hasStage && selectedClient?.fromExistingCustomer &&
      <input type="hidden" name="customerId" value={customerId}/>}
    {selectedClient?.wonLeadId && !hasStage && !selectedClient.fromExistingCustomer &&
      (linkedProject?.customerId && !existing
        ? <input type="hidden" name="customerId" value={linkedProject.customerId}/>
        : <input type="hidden" name="wonLeadId" value={selectedClient.wonLeadId}/> )}

    {hasStage && <><input type="hidden" name="leadId" value={choice!.leadId}/>
      <input type="hidden" name="revisionId" value={choice!.revisionId}/>
      <input type="hidden" name="stageNumber" value={stage!.number}/></>}
    <header className="psi-top">
      <div><div className="psi-breadcrumb"><Link href="/dashboard/finance?tab=invoices">Finance</Link>
        <span>/</span><span>Sales invoices</span><span>/</span><b>{existing ? 'Edit draft' : 'New invoice'}</b></div>
        <h1>Create sales invoice <span className="psi-draft">Draft</span></h1>
        <p>Select an existing client or enter a new customer. Choose a payment stage when applicable.</p>
      </div>
      <div className="psi-header-actions"><Link href="/dashboard/finance?tab=invoices" className="psi-muted-button">Cancel</Link>
        <button type="button" className="psi-outline-button" onClick={()=>setPreview(true)}>Preview invoice</button>
        <button type="submit" className="psi-orange-button" disabled={disabledSave}>Save &amp; preview</button></div>
    </header>
    <div className="psi-columns">
      <div className="psi-left">
        <section className="psi-card">
          <div className="psi-title"><span className="psi-step">1</span><h2>Select customer</h2></div>
          <div className="psi-fields">
            <label className="psi-field psi-wide"><span>Select existing client</span>
              <select aria-label="Select existing client" value={customerId}
                onChange={e=>changeCustomer(e.target.value)} disabled={!canSwitchLead}>
                <option value="">New / one-time customer (enter details below)</option>
                {customers.map(row=><option key={row.id} value={row.id}>
                  {row.name}{row.phone ? ' · '+row.phone : ''}
                  {row.wonLeadId ? ' · Won lead '+(row.leadNumber ?? '') :
                    row.fromApprovedQuotation ? ' · Approved quote' : ''}
                </option>)}
              </select></label>
          </div>
          {hasStage && <div className="psi-attached">
            <span className="psi-check">✓</span><div><strong>{choice!.projectName}</strong>
              <p>Accepted quote {choice!.quoteNumber} · {choice!.projectType || 'Project'}</p>
              <small>On the first issued invoice, this existing quotation project becomes active. Saving a draft does not create it.</small></div>
            </div>}
          {!customerAccess && !customers.length && <p className="psi-hint">Invoice client options could not be loaded.</p>}
          {selectedClient?.wonLeadId && !hasStage && <div className="psi-attached">
            <span className="psi-check">✓</span>
            <div className="psi-won-project-content">
              <strong>Won lead · {selectedClient.leadNumber}</strong>
              <p>{linkedProject
                ? 'Project linked successfully. You can continue preparing this invoice.'
                : 'You can prepare an invoice now. Stage billing requires an accepted quotation and a saved payment plan.'}</p>
              {linkedProject ? <div className="psi-linked-project">
                <span className="psi-project-success" role="status">✓ Project created and linked</span>
                <a href={'/dashboard/projects/'+encodeURIComponent(linkedProject.projectId)}
                   target="_blank" rel="noopener noreferrer">View project ↗</a>
              </div> : canCreateProject ? <button type="button" className="psi-project-create"
                onClick={openProjectDialog}>+ Create Project</button> : null}
            </div>
          </div>}
          {!hasStage && <p className="psi-hint">{customerId
            ? eligibleStages.length
              ? 'This client has an approved quotation. Choose its payment stage below or prepare a normal invoice.'
              : 'Existing client selected. Their billing details are filled in; you can prepare a normal invoice.'
            : 'Choose a saved customer or a Won lead. No new client or project is created automatically.'}</p>}
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
            <label className="psi-field"><span>Billing type</span><select name="documentType" value={type}
              onChange={e=>{const next=e.target.value as GstDocument['documentType'];
                setType(next);if(next!=='tax_invoice')setReverseCharge(false);
                setNonGstReason(next==='bill_of_supply'?'exempt':
                profile.gstin?'non_taxable':'unregistered');}}>
              {profile.gstin&&<option value="tax_invoice">GST bill — Tax invoice</option>}
              {profile.gstin&&<option value="bill_of_supply">Non-GST — Bill of Supply</option>}
              <option value="commercial_invoice">Non-GST — Commercial invoice</option>
             </select></label>
            <label className="psi-field"><span>Invoice date</span><input required type="date" name="date" value={date}
              onChange={e=>setDate(e.target.value)}/></label>
            <label className="psi-field"><span>Due date</span><input type="date" name="dueDate" value={dueDate}
              onChange={e=>setDueDate(e.target.value)}/></label>
            <label className="psi-field"><span>Place of supply (state code)</span><input required name="placeOfSupply"
              pattern="[0-9]{2}" maxLength={2} value={placeOfSupply}
              onChange={e=>setPlaceOfSupply(e.target.value)}/></label>
          </div>
          {type!=='tax_invoice'&&<div className="psi-fields">
            <label className="psi-field"><span>Reason GST is not charged</span>
             <select aria-label="Non-GST reason" value={nonGstReason}
              onChange={event=>setNonGstReason(event.target.value)}>
              {type==='bill_of_supply'?<>
               <option value="exempt">GST-exempt supply</option>
               <option value="composition">Supplier under composition scheme</option>
              </>:profile.gstin?
               <option value="non_taxable">Supply outside GST / non-taxable</option>:
               <option value="unregistered">Supplier is not GST registered</option>}
             </select>
            </label>
            <p className="psi-hint">Non-GST billing is only for qualifying supplies; taxable supplies of GST-registered businesses require GST invoices.</p>
           </div>}
          {type==='tax_invoice'&&<label className="psi-toggle"><input type="checkbox" name="reverseCharge" value="true" checked={reverseCharge}
            onChange={e=>setReverseCharge(e.target.checked)}/> Reverse charge applies</label>}
        </section>
        {eligibleStages.length>0 && <section className="psi-card">
          <div className="psi-title"><span className="psi-step">3</span><h2>Select project stage &amp; payment</h2></div>
          <div className="psi-fields psi-three">
            <label className="psi-field"><span>Payment stage</span>
              <select aria-label="Payment stage"
                value={hasStage ? leadId+':'+stageNumber : ''}
                onChange={e=>changeStage(e.target.value)} disabled={!!existing}>
                <option value="">{selectedClient?.fromApprovedQuotation
                  ? 'Choose an approved payment stage' : 'One-time invoice (no stage)'}</option>
                {eligibleStages.map(group=><optgroup key={group.leadId}
                  label={'Quotation '+group.quoteNumber+' · '+group.projectName}>
                  {group.stages.map(row=><option key={row.number}
                    value={group.leadId+':'+row.number}>
                    {row.number}. {row.name} ({row.percent}%)
                  </option>)}
                </optgroup>)}
              </select></label>
            <div className="psi-field"><span>Scheduled percentage</span>
              <output className="psi-readonly">{stage ? stage.percent+'%' : '—'}</output></div>
            <label className="psi-field"><span>Stage amount (₹)</span>
              <input aria-label="Stage amount" type="number" min="0.01"
                max={stage?.amount} disabled={!hasStage} step="0.01"
                value={hasStage ? lines[0]?.unitPrice ?? 0 : ''}
                readOnly={!ownerCanAllowPartial||!allowPartialStage}
                onChange={e=>updateLine(0,'unitPrice',e.target.value)}/></label>
          </div>
          {hasStage && <p className="psi-hint">Full agreed stage amount: {money(stage!.amount)} before applicable GST. Partial billing is off by default.</p>}
          {hasStage&&ownerCanAllowPartial&&<label className="psi-toggle"><input type="checkbox" checked={allowPartialStage}
            onChange={event=>{setAllowPartialStage(event.target.checked);
              if(!event.target.checked&&stage)updateLine(0,'unitPrice',String(stage.amount));}}/>
            Owner exception: allow partial stage billing</label>}
          {stageInvalid && <p className="psi-alert" role="alert">Stage billing amount must be above zero and cannot exceed the agreed stage amount.</p>}
        </section>}
        <section className="psi-card">
          <div className="psi-title psi-title-between"><div><span className="psi-step">{eligibleStages.length?4:3}</span>
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
              onClick={()=>setLines(all=>all.filter((_,j)=>j!==index))}>×</button></td>
          </tr>)}</tbody></table></div>
          <p className="psi-hint">Use correct HSN/SAC and GST rates for each supply. The server calculates final taxes when saving.</p>
        </section>
        <section className="psi-card">
          <div className="psi-title"><span className="psi-step">{eligibleStages.length?5:4}</span><h2>Notes &amp; terms</h2></div>
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

    {projectDialog && selectedClient?.wonLeadId && <div
      className="psi-modal-backdrop" role="presentation"
      onMouseDown={()=>{if(!projectPending)setProjectDialog(false);}}>
      <section className="psi-modal psi-project-modal" role="dialog" aria-modal="true"
        aria-labelledby="psi-create-project-title"
        onMouseDown={event=>event.stopPropagation()}>
        <div className="psi-modal-head">
          <strong id="psi-create-project-title">Create Project</strong>
          <button type="button" aria-label="Close project popup"
            disabled={projectPending} onClick={()=>setProjectDialog(false)}>×</button>
        </div>
        <p>For <b>{selectedClient.name}</b> · Won lead {selectedClient.leadNumber}</p>
        <label className="psi-field" htmlFor="psi-project-name">
          <span>Project name *</span>
          <input id="psi-project-name" type="text" autoFocus
            required minLength={2} maxLength={200} value={projectName}
            placeholder="Enter project name" disabled={projectPending}
            onChange={e=>setProjectName(e.target.value)}
            onKeyDown={event=>{
              if(event.key==='Escape' && !projectPending) {
                event.preventDefault();setProjectDialog(false);
              }
              if(event.key==='Enter') {
                event.preventDefault();void createProject();
              }
            }}/>
        </label>
        <p className="psi-hint">We'll link this project to the selected Won lead.
          If a quotation already has a project, it will be reused.</p>
        {projectError && <p className="psi-alert" role="alert">{projectError}</p>}
        <div className="psi-project-modal-actions">
          <button className="psi-outline-button" type="button" disabled={projectPending}
            onClick={()=>setProjectDialog(false)}>Cancel</button>
          <button className="psi-orange-button" type="button"
            disabled={projectPending || projectName.trim().length<2}
            onClick={()=>void createProject()}>
            {projectPending ? 'Creating…' : 'Create Project'}
          </button>
        </div>
        <small>After creation, this popup closes and your invoice stays open.</small>
      </section>
    </div>}
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
