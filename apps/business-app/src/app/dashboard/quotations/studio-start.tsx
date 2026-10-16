'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStudioQuotation } from './studio-actions';
import { contactMatches } from './customer-match';

type Industry = { key: string; name: string };
type Customer = { id: string; display_name: string; phone: string; email: string };
type Project = { id: string; customer_id: string; name: string };
type QuoteLead = {
  id: string; lead_number: string; name: string; phone: string; email: string;
  location: string; project_size: string; service_type: string; industryKey: string;
};
type QuoteStyle = 'construction' | 'interior' | 'custom';

export function QuotationStudioStart({
  leads, existingCustomers, existingProjects, industries, defaultCurrency,
  initialCustomerId = '', initialLeadId = '',
}: {
  leads: QuoteLead[];
  existingCustomers: Customer[];
  existingProjects: Project[];
  industries: Industry[];
  defaultCurrency: string;
  initialCustomerId?: string;
  initialLeadId?: string;
}) {
  const router = useRouter();
  const initialLead = leads.find((entry) => entry.id === initialLeadId);
  const initialCustomer = existingCustomers.find((c) => c.id === initialCustomerId) ??
    (initialLead
      ? existingCustomers.find((c) => contactMatches(c, { phone: initialLead.phone, email: initialLead.email }))
      : undefined);
  const [leadId, setLeadId] = useState(initialLead?.id ?? '');
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? '');
  const [projectId, setProjectId] = useState('');
  const [industry, setIndustry] = useState(initialLead?.industryKey &&
    industries.some((i) => i.key === initialLead.industryKey)
      ? initialLead.industryKey
      : (industries.find((i) => i.key === 'construction')?.key ?? industries[0]?.key ?? ''));
  const [style, setStyle] = useState<QuoteStyle>(
    initialLead?.industryKey === 'interior' ? 'interior' :
    initialLead?.industryKey && initialLead.industryKey !== 'construction' ? 'custom' :
    !industries.some((i) => i.key === 'construction') ? 'custom' : 'construction',
  );
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialLead || initialCustomer));
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [data, setData] = useState({
    clientName: initialCustomer?.display_name ?? initialLead?.name ?? '',
    phone: initialCustomer?.phone ?? initialLead?.phone ?? '',
    email: initialCustomer?.email ?? initialLead?.email ?? '',
    projectName: initialLead ? (initialLead.service_type || 'Client') + ' project' : '',
    location: initialLead?.location ?? '',
    plotSize: initialLead?.project_size ?? '',
    projectType: 'Residential',
    notes: '',
  });
  const currentCustomer = existingCustomers.find((c) => c.id === customerId);
  const customerProjects = existingProjects.filter((p) => p.customer_id === customerId);
  const selectedProject = customerProjects.find((p) => p.id === projectId);
  const matchingCustomers = !customerId ? existingCustomers.filter((c) => contactMatches(c, data)) : [];
  const hasConstruction = industries.some((i) => i.key === 'construction');
  const hasInterior = industries.some((i) => i.key === 'interior');
  const otherIndustries = industries.filter((i) => i.key !== 'construction' && i.key !== 'interior');

  const update = (name: keyof typeof data, value: string) => {
    setData((current) => ({ ...current, [name]: value }));
    setFeedback('');
  };
  const chooseCustomer = (customer: Customer | undefined) => {
    setCustomerId(customer?.id ?? '');
    const linkedLead = leads.find((l) => l.id === leadId);
    if (linkedLead && customer && !contactMatches(customer, linkedLead)) {
      setLeadId('');
    }
    setProjectId('');
    setData((current) => ({
      ...current,
      clientName: customer?.display_name ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
    }));
    setFeedback('');
  };
  const chooseStyle = (next: QuoteStyle) => {
    setStyle(next);
    if (next === 'construction') setIndustry(hasConstruction ? 'construction' : industry);
    else if (next === 'interior') setIndustry(hasInterior ? 'interior' : industry);
    else setIndustry(otherIndustries[0]?.key ?? (hasConstruction ? 'construction' : industry));
    setFeedback('');
  };

  return <div className="qs-create-start">
    <div className="qs-create-types" role="group" aria-label="Quotation category">
      <button type="button" className={'qs-create-type' + (style === 'construction' ? ' current' : '')}
        disabled={!hasConstruction} aria-pressed={style === 'construction'}
        onClick={() => chooseStyle('construction')}>
        <span className="qs-create-type-icon">▥</span>
        <strong>Construction</strong>
        <small>Residential, Commercial<br/>Renovation, Extension</small>
      </button>
      <button type="button" className={'qs-create-type' + (style === 'interior' ? ' current' : '')}
        disabled={!hasInterior} aria-pressed={style === 'interior'}
        onClick={() => chooseStyle('interior')}>
        <span className="qs-create-type-icon">▱</span>
        <strong>Interior Design</strong>
        <small>Homes, Apartments<br/>Villas, Offices</small>
      </button>
      <button type="button" className={'qs-create-type' + (style === 'custom' ? ' current' : '')}
        aria-pressed={style === 'custom'} onClick={() => chooseStyle('custom')}>
        <span className="qs-create-type-icon">▦</span>
        <strong>Custom / Others</strong>
        <small>Item-wise BOQ<br/>Custom quotation</small>
      </button>
    </div>

    {style === 'custom' && otherIndustries.length > 0 && <label className="qs-clean-field qs-industry-picker">
      Industry
      <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
        {otherIndustries.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
        {hasConstruction && <option value="construction">Construction BOQ</option>}
        {hasInterior && <option value="interior">Interior BOQ</option>}
      </select>
    </label>}

    <form className="qs-create-form" onSubmit={(event) => {
      event.preventDefault();
      if (!industry) { setFeedback('Select an available quotation type.'); return; }
      if (matchingCustomers.length > 0) {
        setFeedback('An existing client has these contact details. Select that client before continuing.');
        setAdvancedOpen(true);
        return;
      }
      setFeedback('');
      start(async () => {
        const result = await createStudioQuotation({
          ...data, customerId: customerId || null, projectId: projectId || null,
          leadId: leadId || null, industryKey: industry, currency: defaultCurrency,
        });
        if (!result.ok || !result.revisionId) {
          setFeedback(result.message);
          return;
        }
        const mode = style === 'construction' ? 'sft' : 'custom';
        router.push('/dashboard/quotations/' + result.revisionId + '/studio?mode=' + mode + '&step=quote');
      });
    }}>
      <div className="qs-clean-form-title">
        <span className="qs-clean-form-icon" aria-hidden="true">♙</span>
        <h2>Client &amp; Project Details</h2>
      </div>

      {(leads.length > 0 || existingCustomers.length > 0) &&
        <details className="qs-create-existing" open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary>Use existing client or lead <span aria-hidden="true">⌄</span></summary>
          <div className="qs-create-existing-body">
            {leads.length > 0 && <label className="qs-clean-field">Select a lead
              <select value={leadId} onChange={(event) => {
                const value = event.target.value;
                setLeadId(value);
                const lead = leads.find((l) => l.id === value);
                if (!lead) return;
                const customer = existingCustomers.find((c) =>
                  contactMatches(c, { phone: lead.phone, email: lead.email }));
                setCustomerId(customer?.id ?? '');
                setProjectId('');
                setData((current) => ({
                  ...current,
                  clientName: customer?.display_name || lead.name,
                  phone: customer?.phone || lead.phone,
                  email: customer?.email || lead.email,
                  projectName: (lead.service_type || 'Client') + ' project',
                  location: lead.location || '', plotSize: lead.project_size || '',
                }));
                if (industries.some((i) => i.key === lead.industryKey)) {
                  setIndustry(lead.industryKey);
                  setStyle(lead.industryKey === 'interior' ? 'interior' :
                    lead.industryKey === 'construction' ? 'construction' : 'custom');
                }
                setFeedback('');
              }}>
                <option value="">No lead selected</option>
                {leads.map((lead) => <option key={lead.id} value={lead.id}>
                  {lead.name} · {lead.lead_number}
                </option>)}
              </select>
            </label>}
            {existingCustomers.length > 0 && <label className="qs-clean-field">Existing customer / CRN
              <select value={customerId} onChange={(event) => {
                const selected = existingCustomers.find((c) => c.id === event.target.value);
                chooseCustomer(selected);
              }}>
                <option value="">New customer</option>
                {existingCustomers.map((customer) => <option key={customer.id} value={customer.id}>
                  {customer.display_name} · CRN-{customer.id.replaceAll('-', '').slice(0, 12).toUpperCase()}
                </option>)}
              </select>
            </label>}
            {currentCustomer && <label className="qs-clean-field">Existing project (optional)
              <select value={projectId} onChange={(event) => {
                const project = customerProjects.find((p) => p.id === event.target.value);
                setProjectId(project?.id ?? '');
                if (project) update('projectName', project.name);
              }}>
                <option value="">Create new project</option>
                {customerProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>}
          </div>
        </details>}

      {matchingCustomers.length > 0 && <div className="qs-clean-matches" role="alert">
        <strong>Existing client found.</strong> Choose the matching account to keep one CRN.
        <div>
          {matchingCustomers.slice(0, 5).map((c) => <button type="button" key={c.id}
            onClick={() => { chooseCustomer(c); setAdvancedOpen(true); }}>
            {c.display_name} · {c.phone || c.email}
          </button>)}
        </div>
      </div>}

      <div className="qs-create-field-grid">
        <label className="qs-clean-field">Client Name <span>*</span>
          <input required maxLength={200} placeholder="Enter client name"
            autoComplete="name" readOnly={Boolean(currentCustomer)}
            value={data.clientName} onChange={(event) => update('clientName', event.target.value)}/>
        </label>
        <label className="qs-clean-field">Phone Number <span>*</span>
          <input type="tel" required minLength={3} maxLength={40} autoComplete="tel"
            placeholder="Enter phone number" readOnly={Boolean(currentCustomer)}
            value={data.phone} onChange={(event) => update('phone', event.target.value)}/>
        </label>
        <label className="qs-clean-field">Email Address
          <input type="email" maxLength={254} autoComplete="email"
            placeholder="Enter email address" readOnly={Boolean(currentCustomer)}
            value={data.email} onChange={(event) => update('email', event.target.value)}/>
        </label>
        <label className="qs-clean-field">Project Name <span>*</span>
          <input required maxLength={200} placeholder="Enter project name"
            readOnly={Boolean(selectedProject)}
            value={data.projectName} onChange={(event) => update('projectName', event.target.value)}/>
        </label>
        <label className="qs-clean-field">Project Location
          <input maxLength={200} placeholder="Enter project location"
            value={data.location} onChange={(event) => update('location', event.target.value)}/>
        </label>
        <label className="qs-clean-field">Plot Area / Property Configuration
          <input maxLength={40} placeholder={industry === 'interior' ? '3BHK' : 'e.g. 200 sq yards'}
            value={data.plotSize} onChange={(event) => update('plotSize', event.target.value)}/>
        </label>
        <label className="qs-clean-field">Project Type
          <select value={data.projectType} onChange={(event) => update('projectType', event.target.value)}>
            <option>Residential</option><option>Commercial</option>
            <option>Renovation</option><option>Extension</option>
          </select>
        </label>
        <label className="qs-clean-field qs-clean-notes">Additional Notes (optional)
          <textarea rows={3} maxLength={1000} disabled={Boolean(selectedProject)}
            placeholder={selectedProject
              ? 'Use Projects to edit notes on an existing project'
              : 'Any special requirements, site details or notes…'}
            value={data.notes} onChange={(event) => update('notes', event.target.value)}/>
        </label>
      </div>
      {feedback && <p role="alert" className="qs-clean-feedback">{feedback}</p>}
      <div className="qs-clean-form-actions">
        <button className="qs-clean-next" type="submit"
          disabled={pending || !industry || matchingCustomers.length > 0}>
          {pending ? 'Creating quotation…' : 'Next →'}
        </button>
      </div>
    </form>
  </div>;
}
