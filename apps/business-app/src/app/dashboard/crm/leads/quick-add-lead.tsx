'use client';

import { useState } from 'react';
import { createQuickLead } from './quick-add-action';
import { initializeCrmForImports } from './import/actions';
import type { LeadService, LeadServiceOption } from './lead-service-options';

type Option = { value: string; label: string };
type Construction = {
  projectType: 'residential' | 'commercial' | 'renovation' | 'extension';
  plotArea: string;
  floors: 'ground' | 'g1' | 'g2' | 'g3plus';
  builtUpArea: string;
  budget: string;
  timeline: string;
};
type Interior = {
  propertyType: 'apartment' | 'villa' | 'independent_house' | 'office' | 'commercial_space';
  bhk: string;
  scope: 'end_to_end' | 'selected_work';
  selectedWork: Array<
    'modular_kitchen' | 'wardrobes' | 'tv_unit' | 'false_ceiling' |
    'furniture' | 'lighting' | 'painting' | 'pooja_unit' | 'study_unit' |
    'crockery_unit'
  >;
  style: string;
  budget: string;
  timeline: string;
};
const constructionBudget = [
  ['','Select budget range'], ['under_25_lakh','Below ₹25 lakh'],
  ['25_50_lakh','₹25–50 lakh'], ['50_lakh_1_cr','₹50 lakh–₹1 crore'],
  ['above_1_cr','Above ₹1 crore'],
];
const interiorBudget = [
  ['','Select budget range'], ['below_3_lakh','Below ₹3 lakh'],
  ['3_5_lakh','₹3–5 lakh'], ['5_10_lakh','₹5–10 lakh'],
  ['10_20_lakh','₹10–20 lakh'], ['above_20_lakh','Above ₹20 lakh'],
];
const startOptions = [
  ['','Select timeline'], ['immediately','Immediately'],
  ['within_1_month','Within 1 month'], ['1_3_months','1–3 months'],
  ['3_6_months','3–6 months'], ['planning','Just planning'],
];
const workOptions: Array<{value: Interior['selectedWork'][number]; label:string}> = [
  { value:'modular_kitchen', label:'Modular Kitchen' },
  { value:'wardrobes', label:'Wardrobes' },
  { value:'tv_unit', label:'TV Unit' },
  { value:'false_ceiling', label:'False Ceiling' },
  { value:'furniture', label:'Furniture' },
  { value:'lighting', label:'Lighting' },
  { value:'painting', label:'Painting' },
  { value:'pooja_unit', label:'Pooja Unit' },
  { value:'study_unit', label:'Study Unit' },
  { value:'crockery_unit', label:'Crockery Unit' },
];
function OptionList({ items }: { items: string[][] }) {
  return items.map(([value,label]) => <option key={value} value={value}>{label}</option>);
}

export function QuickAddLead({
  sources, stages, services, canConfigureCrm, onClose,
}: {
  sources: Option[];
  stages: Option[];
  services: LeadServiceOption[];
  canConfigureCrm: boolean;
  onClose: () => void;
}) {
  const [service, setService] = useState<LeadService | ''>(services[0]?.value ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pincode, setPincode] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [construction, setConstruction] = useState<Construction>({
    projectType: 'residential', plotArea: '', floors: 'ground',
    builtUpArea: '', budget: '', timeline: '',
  });
  const [interior, setInterior] = useState<Interior>({
    propertyType: 'apartment', bhk: '', scope: 'end_to_end',
    selectedWork: [], style: '', budget: '', timeline: '',
  });
  const [sourceId, setSourceId] = useState(
    sources.find((source) => /manual/i.test(source.label))?.value ??
    sources[0]?.value ?? '',
  );
  const [stageId, setStageId] = useState(stages[0]?.value ?? '');
  const [busy, setBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const isBusiness = ['office', 'commercial_space'].includes(interior.propertyType);
  const valid = Boolean(
    service && name.trim() && phone.trim() && sourceId && stageId &&
    (!pincode || /^[0-9]{6}$/.test(pincode)) &&
    (service !== 'construction' || Number(construction.plotArea) > 0) &&
    (service !== 'interior' || (
      (isBusiness || Boolean(interior.bhk)) &&
      (interior.scope !== 'selected_work' || interior.selectedWork.length > 0)
    )),
  );
  const setC = (values: Partial<Construction>) =>
    setConstruction((current) => ({ ...current, ...values }));
  const setI = (values: Partial<Interior>) =>
    setInterior((current) => ({ ...current, ...values }));
  return (
    <section className="crm-inline-lead-tool crm-lead-editor" aria-label="Add a lead">
      <div className="crm-lead-hero">
        <div>
          <p className="crm-lead-eyebrow">PRO PULSE · BUSINESS OS</p>
          <h2>Add New Lead</h2>
          <p>Save the customer directly into All Leads without leaving this page.</p>
        </div>
        <button type="button" className="crm-outline" onClick={onClose}>Close</button>
      </div>
      <form className="crm-lead-form" onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !valid || !service) return;
        setBusy(true);
        setFeedback('');
        try {
          const result = await createQuickLead({
            name, phone, email, pincode, location, notes, service,
            sourceId, stageId,
            construction: service === 'construction' ? construction : undefined,
            interior: service === 'interior' ? interior : undefined,
          });
          setFeedback(result.message);
          if (result.ok) window.location.reload();
        } catch {
          setFeedback('Could not save the lead. Please retry.');
        } finally {
          setBusy(false);
        }
      }}>
        <div className="crm-lead-service-panel">
          <div className="crm-lead-section-title">
            <span aria-hidden="true" className="crm-lead-section-icon">⌂</span>
            <div><h3>Service Type</h3><p>Based on your company's registered services</p></div>
          </div>
          {services.length === 1 ? (
            <div className="crm-lead-locked-service">
              <strong>{services[0]?.label}</strong>
              <span>Company service</span>
            </div>
          ) : services.length > 1 ? (
            <label className="crm-lead-service-selector">
              Choose service *
              <select required value={service} onChange={(event) => {
                setService(event.target.value as LeadService);
                setFeedback('');
              }}>
                {services.map((entry) =>
                  <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </label>
          ) : (
            <p role="alert" className="crm-integration-message">
              Construction or Interiors must be enabled for this company before creating a service lead.
            </p>
          )}
        </div>

        <section className="crm-lead-section">
          <div className="crm-lead-section-title">
            <span className="crm-lead-section-icon" aria-hidden="true">01</span>
            <h3>Customer Information</h3>
          </div>
          <div className="crm-quick-add-form">
            <label>Customer Name *<input value={name} required maxLength={200}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter customer name" autoComplete="name" /></label>
            <label>Mobile Number *<input value={phone} required type="tel" inputMode="tel"
              maxLength={50} onChange={(event) => setPhone(event.target.value)}
              placeholder="+91 98765 43210" autoComplete="tel" /></label>
            <label className="crm-quick-add-wide">Email (optional)
              <input type="email" value={email} maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter email address" autoComplete="email" /></label>
            <label>PIN Code<input value={pincode} inputMode="numeric" maxLength={6}
              pattern="[0-9]{6}" onChange={(event) =>
                setPincode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="Enter 6-digit PIN" autoComplete="postal-code" /></label>
            <label>City / Area<input value={location} maxLength={500}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Enter city or area" autoComplete="address-level2" /></label>
          </div>
        </section>

        {service === 'construction' && (
          <section className="crm-lead-section crm-lead-construction">
            <div className="crm-lead-section-title">
              <span aria-hidden="true" className="crm-lead-section-icon">02</span>
              <h3>Construction Details</h3>
            </div>
            <div className="crm-quick-add-form">
              <label>Project Type *<select required value={construction.projectType}
                onChange={(event) => setC({
                  projectType: event.target.value as Construction['projectType'],
                })}>
                <OptionList items={[
                  ['residential','Residential'],['commercial','Commercial'],
                  ['renovation','Renovation'],['extension','Extension'],
                ]} />
              </select></label>
              <label>Plot Area (sq. yards) *<input type="number" required min="0.01"
                step="0.01" max="10000000" value={construction.plotArea}
                onChange={(event) => setC({plotArea:event.target.value})}
                placeholder="Enter plot area" /></label>
              <label>Floors *<select required value={construction.floors}
                onChange={(event) => setC({
                  floors: event.target.value as Construction['floors'],
                })}>
                <OptionList items={[
                  ['ground','Ground Floor'],['g1','G+1'],['g2','G+2'],
                  ['g3plus','G+3 and above'],
                ]} />
              </select></label>
              <label>Built-up Area (sq. ft.)<input type="number" min="0.01" max="10000000"
                step="0.01" value={construction.builtUpArea}
                onChange={(event) => setC({builtUpArea:event.target.value})}
                placeholder="Enter built-up area" /></label>
              <label>Budget Range<select value={construction.budget}
                onChange={(event) => setC({budget:event.target.value})}>
                <OptionList items={constructionBudget} />
              </select></label>
              <label>Start Timeline<select value={construction.timeline}
                onChange={(event) => setC({timeline:event.target.value})}>
                <OptionList items={startOptions} />
              </select></label>
            </div>
          </section>
        )}

        {service === 'interior' && (
          <section className="crm-lead-section crm-lead-interior">
            <div className="crm-lead-section-title">
              <span aria-hidden="true" className="crm-lead-section-icon">02</span>
              <h3>Interior Details</h3>
            </div>
            <div className="crm-quick-add-form">
              <label>Property Type *<select value={interior.propertyType} required
                onChange={(event) => setI({
                  propertyType: event.target.value as Interior['propertyType'],
                  bhk: '',
                })}>
                <OptionList items={[
                  ['apartment','Apartment'],['villa','Villa'],
                  ['independent_house','Independent House'],['office','Office'],
                  ['commercial_space','Commercial Space'],
                ]} />
              </select></label>
              {!isBusiness && <label>BHK *<select value={interior.bhk} required
                onChange={(event) => setI({bhk:event.target.value})}>
                <OptionList items={[
                  ['','Select BHK'],['1_bhk','1 BHK'],['2_bhk','2 BHK'],
                  ['3_bhk','3 BHK'],['4_bhk','4 BHK'],['5_plus_bhk','5+ BHK'],
                ]} />
              </select></label>}
              <fieldset className="crm-lead-fieldset crm-quick-add-wide">
                <legend>Work Scope *</legend>
                <div className="crm-lead-scope-options">
                  {([['end_to_end','Full Home Interiors'],['selected_work','Specific Work']] as const).map(([value,label]) => (
                    <button key={value} type="button"
                      aria-pressed={interior.scope === value}
                      className={interior.scope === value ? 'crm-lead-selected' : ''}
                      onClick={() => setI({scope:value})}>{label}</button>
                  ))}
                </div>
              </fieldset>
              {interior.scope === 'selected_work' &&
                <fieldset className="crm-lead-fieldset crm-quick-add-wide">
                  <legend>Specific Work (select all that apply) *</legend>
                  <div className="crm-lead-work-grid">
                    {workOptions.map((entry) => {
                      const checked = interior.selectedWork.includes(entry.value);
                      return <label key={entry.value} className={checked ? 'crm-work-selected' : ''}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setI({
                            selectedWork: checked
                              ? interior.selectedWork.filter((item) => item !== entry.value)
                              : [...interior.selectedWork, entry.value],
                          })} />
                        {entry.label}
                      </label>;
                    })}
                  </div>
                </fieldset>}
              <label>Style Preference<select value={interior.style}
                onChange={(event) => setI({style:event.target.value})}>
                <OptionList items={[
                  ['','Select style'],['modern','Modern'],['minimalist','Minimalist'],
                  ['contemporary','Contemporary'],['traditional','Traditional'],
                  ['luxury','Luxury'],
                ]} />
              </select></label>
              <label>Budget Range<select value={interior.budget}
                onChange={(event) => setI({budget:event.target.value})}>
                <OptionList items={interiorBudget} />
              </select></label>
              <label>Start Timeline<select value={interior.timeline}
                onChange={(event) => setI({timeline:event.target.value})}>
                <OptionList items={startOptions} />
              </select></label>
            </div>
          </section>
        )}

        <section className="crm-lead-section">
          <div className="crm-lead-section-title">
            <span className="crm-lead-section-icon" aria-hidden="true">03</span>
            <h3>Additional Information</h3>
          </div>
          <div className="crm-quick-add-form">
            <label className="crm-quick-add-wide">Project Requirements / Notes
              <textarea value={notes} maxLength={5000} rows={3}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Project details, preferred calling time or any special requests…" />
            </label>
            <label>Lead Source *<select value={sourceId} required
              onChange={(event) => setSourceId(event.target.value)}>
              {!sources.length && <option value="">No sources configured</option>}
              {sources.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select></label>
            <label>Initial Stage *<select value={stageId} required
              onChange={(event) => setStageId(event.target.value)}>
              {!stages.length && <option value="">No stages configured</option>}
              {stages.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select></label>
          </div>
        </section>
        {(!sources.length || !stages.length) && (
          <div className="crm-integration-message" role="alert">
            <p>Your company needs an active lead source and an open pipeline stage.</p>
            {canConfigureCrm ? <button type="button" className="crm-outline"
              disabled={setupBusy} onClick={async () => {
                setSetupBusy(true);
                try {
                  const result = await initializeCrmForImports();
                  setFeedback(result.message);
                  if (result.ok) window.location.reload();
                } catch { setFeedback('Could not initialize CRM. Please retry.'); }
                finally { setSetupBusy(false); }
              }}>{setupBusy ? 'Preparing CRM…' : 'Set up lead sources and stages'}</button>
              : <p>Ask your company owner to configure CRM defaults.</p>}
          </div>
        )}
        {feedback && <p role="status" className="crm-integration-message">{feedback}</p>}
        <div className="crm-lead-submit-bar">
          <button className="crm-primary" type="submit" disabled={busy || !valid}>
            {busy ? 'Saving lead…' : 'Save Lead'}
          </button>
        </div>
      </form>
    </section>
  );
}
