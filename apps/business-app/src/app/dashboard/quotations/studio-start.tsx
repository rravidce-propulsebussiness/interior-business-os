'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStudioQuotation } from './studio-actions';

type Industry = { key: string; name: string };
type ExistingCustomer = {
  id: string;
  display_name: string;
  phone: string;
  email: string;
};
type ExistingProject = { id: string; customer_id: string; name: string };

type QuoteLead = {
  id: string;
  lead_number: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  project_size: string;
  service_type: string;
  industryKey: string;
};

export function QuotationStudioStart({
  leads,
  existingCustomers,
  existingProjects,
  industries,
  defaultCurrency,
}: {
  leads: QuoteLead[];
  existingCustomers: ExistingCustomer[];
  existingProjects: ExistingProject[];
  industries: Industry[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [industry, setIndustry] = useState(
    industries.find((item) => item.key === 'construction')?.key ??
      industries[0]?.key ??
      '',
  );
  const [mode, setMode] = useState<'sft' | 'custom' | 'upload'>('sft');
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const currentCustomer = existingCustomers.find(
    (customer) => customer.id === customerId,
  );
  const customerProjects = existingProjects.filter(
    (project) => project.customer_id === customerId,
  );
  const selectedProject = customerProjects.find(
    (project) => project.id === projectId,
  );
  const customerCrn = customerId
    ? 'CRN-' + customerId.replaceAll('-', '').slice(0, 12).toUpperCase()
    : '';
  const [data, setData] = useState({
    clientName: '',
    phone: '',
    email: '',
    projectName: '',
    location: '',
    plotSize: '',
    projectType: 'Residential',
  });
  const update = (key: keyof typeof data, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setFeedback('');
  };
  const methods = [
    {
      key: 'sft',
      title: 'Per sq ft (SFT)',
      helper: 'Floor-wise area × rate',
      icon: '▦',
    },
    {
      key: 'custom',
      title: 'Custom BOQ / Materials',
      helper: 'Item-wise dimensions and finishes',
      icon: '▤',
    },
    {
      key: 'upload',
      title: 'Upload existing PDF',
      helper: 'Attach supporting quotation files',
      icon: '⇧',
    },
  ] as const;

  return (
    <div className="qs-editor">
      <section className="qs-card">
        <h2>Choose quotation type</h2>
        <div className="qs-sector-tabs">
          {industries.slice(0, 2).map((item) => (
            <button
              type="button"
              key={item.key}
              className={
                'qs-sector' + (industry === item.key ? ' current' : '')
              }
              aria-pressed={industry === item.key}
              onClick={() => {
                setIndustry(item.key);
                if (item.key === 'interior' && mode === 'sft')
                  setMode('custom');
              }}
            >
              {item.key === 'construction' ? '▦' : '▱'} {item.name}
            </button>
          ))}
          {industries.length > 2 ? (
            <select
              className="qs-sector"
              aria-label="Other industry"
              value={
                industries.slice(2).some((item) => item.key === industry)
                  ? industry
                  : ''
              }
              onChange={(event) => {
                setIndustry(event.target.value);
                setMode('custom');
              }}
            >
              <option value="">Other industries</option>
              {industries.slice(2).map((item) => (
                <option value={item.key} key={item.key}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <span
              className="qs-sector"
              style={{ cursor: 'default', opacity: 0.6 }}
            >
              ◈ Other industries · Soon
            </span>
          )}
        </div>
        <div className="qs-divider" />
        <div className="qs-method-tabs">
          {methods.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              aria-pressed={mode === item.key}
              className={'qs-method' + (mode === item.key ? ' current' : '')}
            >
              <span className="qs-icon-chip">{item.icon}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.helper}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <form
        className="qs-card"
        onSubmit={(event) => {
          event.preventDefault();
          setFeedback('');
          if (!industry) {
            setFeedback('Select an available industry.');
            return;
          }
          start(async () => {
            const result = await createStudioQuotation({
              ...data,
              customerId: customerId || null,
              projectId: projectId || null,
              industryKey: industry,
              currency: defaultCurrency,
            });
            if (!result.ok || !result.revisionId) {
              setFeedback(result.message);
              return;
            }
            const next = new URLSearchParams({
              mode: mode === 'upload' ? 'pdf' : mode,
              ...(mode === 'upload' ? { step: 'files' } : {}),
            });
            router.push(
              '/dashboard/quotations/' + result.revisionId + '/studio?' + next,
            );
          });
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2>Client &amp; Project Details</h2>
          <span className="qs-selected-pill">Step 01 · Details</span>
        </div>
        {leads.length > 0 && (
          <label className="qs-field" style={{ marginBottom: 15 }}>
            Choose from Leads (optional)
            <select
              defaultValue=""
              onChange={(event) => {
                const lead = leads.find(
                  (item) => item.id === event.target.value,
                );
                if (!lead) return;
                const match = existingCustomers.find(
                  (customer) =>
                    customer.display_name.trim().toLowerCase() ===
                      lead.name.trim().toLowerCase() &&
                    ((lead.email &&
                      customer.email.toLowerCase() ===
                        lead.email.toLowerCase()) ||
                      (lead.phone &&
                        customer.phone.replace(/\D/g, '') ===
                          lead.phone.replace(/\D/g, ''))),
                );
                setCustomerId(match?.id ?? '');
                setProjectId('');
                setData({
                  clientName: match?.display_name || lead.name || '',
                  phone: match?.phone || lead.phone || '',
                  email: match?.email || lead.email || '',
                  projectName: (lead.service_type || 'Client') + ' project',
                  location: lead.location || '',
                  plotSize: lead.project_size || '',
                  projectType: 'Residential',
                });
                if (industries.some((item) => item.key === lead.industryKey)) {
                  setIndustry(lead.industryKey);
                  if (lead.industryKey === 'interior') setMode('custom');
                }
                setFeedback(
                  'Lead details loaded. Review before creating the quotation.',
                );
              }}
            >
              <option value="">Enter client details manually</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name || 'Unnamed lead'} · {lead.lead_number}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="qs-note" style={{ marginBottom: 16 }}>
          Each customer has one permanent Customer Reference Number (CRN).
          Choose an existing customer to keep their quotation history under the
          same CRN. Creating a new quotation for an existing project opens its
          current quotation rather than making a duplicate.
        </div>
        <div className="qs-fields" style={{ marginBottom: 16 }}>
          <label className="qs-field qs-field-full">
            Existing customer / CRN
            <select
              value={customerId}
              onChange={(event) => {
                const id = event.target.value;
                const selected = existingCustomers.find(
                  (customer) => customer.id === id,
                );
                setCustomerId(id);
                setProjectId('');
                setData((prev) => ({
                  ...prev,
                  clientName: selected?.display_name ?? '',
                  phone: selected?.phone ?? '',
                  email: selected?.email ?? '',
                }));
                setFeedback('');
              }}
            >
              <option value="">
                + New customer (only if not registered already)
              </option>
              {existingCustomers.map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {'CRN-' +
                    customer.id
                      .replaceAll('-', '')
                      .slice(0, 12)
                      .toUpperCase()}{' '}
                  · {customer.display_name} · {customer.phone}
                </option>
              ))}
            </select>
          </label>
          {currentCustomer && (
            <label className="qs-field qs-field-full">
              Project under {customerCrn}
              <select
                value={projectId}
                onChange={(event) => {
                  const id = event.target.value;
                  const project = customerProjects.find(
                    (item) => item.id === id,
                  );
                  setProjectId(id);
                  if (project) update('projectName', project.name);
                  setFeedback('');
                }}
              >
                <option value="">+ Create new project for this customer</option>
                {customerProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="qs-fields">
          <label className="qs-field">
            Client name *
            <input
              required
              maxLength={200}
              value={data.clientName}
              readOnly={Boolean(currentCustomer)}
              placeholder="Client full name"
              onChange={(e) => update('clientName', e.target.value)}
            />
          </label>
          <label className="qs-field">
            Phone *
            <input
              required
              type="tel"
              minLength={3}
              maxLength={40}
              value={data.phone}
              readOnly={Boolean(currentCustomer)}
              placeholder="+91 98765 43210"
              onChange={(e) => update('phone', e.target.value)}
            />
          </label>
          <label className="qs-field">
            Email
            <input
              type="email"
              maxLength={254}
              value={data.email}
              readOnly={Boolean(currentCustomer)}
              placeholder="client@example.com"
              onChange={(e) => update('email', e.target.value)}
            />
          </label>
          <label className="qs-field">
            Project name *
            <input
              required
              maxLength={200}
              value={data.projectName}
              readOnly={Boolean(selectedProject)}
              placeholder="Residential construction"
              onChange={(e) => update('projectName', e.target.value)}
            />
          </label>
          <label className="qs-field">
            Project location
            <input
              maxLength={200}
              value={data.location}
              placeholder="Hyderabad, Telangana"
              onChange={(e) => update('location', e.target.value)}
            />
          </label>
          <label className="qs-field">
            Project type *
            <select
              required
              value={data.projectType}
              onChange={(e) => update('projectType', e.target.value)}
            >
              <option>Residential</option>
              <option>Commercial</option>
              <option>Renovation</option>
              <option>Extension</option>
            </select>
          </label>
          <label className="qs-field qs-field-full">
            Plot size or property configuration (optional)
            <input
              maxLength={40}
              value={data.plotSize}
              placeholder="200 sq yards / 3BHK"
              onChange={(e) => update('plotSize', e.target.value)}
            />
          </label>
        </div>
        <div className="qs-divider" />
        <div className="qs-note">
          {customerCrn ? customerCrn + ' · ' : 'A new CRN will be assigned. '}
          Your quotation will use this company&apos;s saved name, logo, contact
          details, quotation prefix and terms. You can change pricing,
          materials, payment terms and PDF attachments after creating the draft.
        </div>
        {feedback && (
          <p role="alert" className="qs-warning" style={{ marginTop: 13 }}>
            {feedback}
          </p>
        )}
        <div
          className="qs-toolbar"
          style={{ justifyContent: 'flex-end', marginTop: 15 }}
        >
          <button
            className="qs-btn primary"
            disabled={pending || !industry}
            type="submit"
          >
            {pending
              ? 'Creating quotation…'
              : 'Create quotation and continue →'}
          </button>
        </div>
      </form>
    </div>
  );
}
