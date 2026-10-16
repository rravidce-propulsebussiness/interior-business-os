'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createStudioQuotation } from './studio-actions';
import { contactMatches } from './customer-match';

type Industry = { key: string; name: string };
type Customer = { id: string; display_name: string; phone: string; email: string };
type QuoteLead = {
  id: string; lead_number: string; name: string; phone: string; email: string;
  location: string; project_size: string; service_type: string; industryKey: string;
};

export function QuotationStudioStart({
  leads, existingCustomers, industries, defaultCurrency,
  initialCustomerId = '', initialLeadId = '',
}: {
  leads: QuoteLead[];
  existingCustomers: Customer[];
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
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialCustomerId));
  const selectedLead = leads.find((entry) => entry.id === leadId);
  // Quote industry is sourced only from the CRM lead, never chosen a second time.
  const industry = selectedLead?.industryKey &&
    industries.some((entry) => entry.key === selectedLead.industryKey)
      ? selectedLead.industryKey : '';
  const industryName = industries.find((entry) => entry.key === industry)?.name ?? '';
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
  const matchingCustomers = !customerId ? existingCustomers.filter((c) => contactMatches(c, data)) : [];
  const update = (name: keyof typeof data, value: string) => {
    setData((current) => ({ ...current, [name]: value }));
    setFeedback('');
  };
  const chooseCustomer = (customer: Customer | undefined) => {
    if (selectedLead && customer && !contactMatches(customer, selectedLead)) {
      setFeedback('This customer does not match the selected lead. Choose the matching client.');
      return;
    }
    setCustomerId(customer?.id ?? '');
    setData((current) => ({
      ...current,
      clientName: customer?.display_name ?? selectedLead?.name ?? '',
      phone: customer?.phone ?? selectedLead?.phone ?? '',
      email: customer?.email ?? selectedLead?.email ?? '',
    }));
    setFeedback('');
  };
  const chooseLead = (value: string) => {
    const lead = leads.find((entry) => entry.id === value);
    const customer = lead ? existingCustomers.find((entry) =>
      contactMatches(entry, { phone: lead.phone, email: lead.email })) : undefined;
    setLeadId(lead?.id ?? '');
    setCustomerId(customer?.id ?? '');
    setData((current) => ({
      ...current,
      clientName: customer?.display_name ?? lead?.name ?? '',
      phone: customer?.phone ?? lead?.phone ?? '',
      email: customer?.email ?? lead?.email ?? '',
      projectName: lead ? (lead.service_type || 'Client') + ' project' : '',
      location: lead?.location ?? '',
      plotSize: lead?.project_size ?? '',
    }));
    setFeedback('');
  };

  return <div className="qs-create-start">
    <form className="qs-create-form" onSubmit={(event) => {
      event.preventDefault();
      if (!leadId || !industry) { setFeedback('Select a classified lead before continuing.'); return; }
      if (matchingCustomers.length > 0) {
        setFeedback('An existing client has these contact details. Select that client before continuing.');
        setAdvancedOpen(true);
        return;
      }
      setFeedback('');
      start(async () => {
        const result = await createStudioQuotation({
          ...data, customerId: customerId || null,
          leadId, currency: defaultCurrency,
        });
        if (!result.ok || !result.revisionId) {
          setFeedback(result.message);
          return;
        }
        const mode = industry === 'construction' ? 'sft' : 'custom';
        router.push('/dashboard/quotations/' + result.revisionId + '/studio?mode=' + mode + '&step=quote');
      });
    }}>
      <div className="qs-clean-form-title">
        <span className="qs-clean-form-icon" aria-hidden="true">♙</span>
        <h2>Client &amp; Project Details</h2>
      </div>

      <div className="qs-source-lead">
        {leads.length > 0 ? (
          <label className="qs-clean-field qs-source-picker">
            Select lead <span>*</span>
            <select required value={leadId} onChange={(event) => chooseLead(event.target.value)}>
              <option value="">Choose a lead</option>
              {leads.map((entry) => <option key={entry.id} value={entry.id}>
                {entry.name} · {entry.lead_number}
              </option>)}
            </select>
          </label>
        ) : (
          <p className="qs-source-guidance">
            No leads available. <Link href="/dashboard/crm/leads">Add a lead</Link> before creating a quote.
          </p>
        )}
        {selectedLead && industry ? (
          <p className="qs-source-service" role="status">
            <span className="qs-source-indicator" aria-hidden="true"/> {industryName} · Auto-detected from lead
          </p>
        ) : selectedLead ? (
          <p className="qs-source-warning" role="alert">
            This lead needs an industry classification.
            {' '}<Link href={'/dashboard/crm/leads/' + selectedLead.id}>Classify the lead</Link> to prepare its quote.
          </p>
        ) : leads.length > 0 ? (
          <p className="qs-source-guidance">Client and project details fill automatically from the selected lead.</p>
        ) : null}
      </div>

      {existingCustomers.length > 0 && <details className="qs-create-existing"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
        <summary>Existing client / CRN <span aria-hidden="true">⌄</span></summary>
        <div className="qs-create-existing-body">
          <label className="qs-clean-field">Existing customer / CRN
            <select value={customerId} onChange={(event) => {
              const selected = existingCustomers.find((c) => c.id === event.target.value);
              chooseCustomer(selected);
            }}>
              <option value="">New customer</option>
              {existingCustomers.map((customer) => <option key={customer.id} value={customer.id}>
                {customer.display_name} · CRN-{customer.id.replaceAll('-', '').slice(0, 12).toUpperCase()}
              </option>)}
            </select>
          </label>
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
          <textarea rows={3} maxLength={1000}
            placeholder="Any special requirements, site details or notes…"
            value={data.notes} onChange={(event) => update('notes', event.target.value)}/>
        </label>
      </div>
      {feedback && <p role="alert" className="qs-clean-feedback">{feedback}</p>}
      <div className="qs-clean-form-actions">
        <button className="qs-clean-next" type="submit"
          disabled={pending || !leadId || !industry || matchingCustomers.length > 0}>
          {pending ? 'Creating quotation…' : 'Next →'}
        </button>
      </div>
    </form>
  </div>;
}
