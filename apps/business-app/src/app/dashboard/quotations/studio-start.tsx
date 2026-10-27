'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createStudioQuotation } from './studio-actions';

type Industry = { key: string; name: string };
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
  floorCount: number | null;
};

export function QuotationStudioStart({
  leads,
  industries,
  defaultCurrency,
  initialLeadId = '',
  initialPackageId = '',
  initialPackageIndustry = '',
  initialCustomizedQuote = false,
}: {
  leads: QuoteLead[];
  industries: Industry[];
  defaultCurrency: string;
  initialLeadId?: string;
  initialPackageId?: string;
  initialPackageIndustry?: string;
  initialCustomizedQuote?: boolean;
}) {
  const router = useRouter();
  const initialLead = leads.find((entry) => entry.id === initialLeadId);
  const [leadId, setLeadId] = useState(initialLead?.id ?? '');
  const selectedLead = leads.find((entry) => entry.id === leadId);
  // Quote industry is sourced only from the CRM lead, never chosen a second time.
  const industry =
    selectedLead?.industryKey &&
    industries.some((entry) => entry.key === selectedLead.industryKey)
      ? selectedLead.industryKey
      : '';
  const industryName =
    industries.find((entry) => entry.key === industry)?.name ?? '';
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [data, setData] = useState({
    clientName: initialLead?.name ?? '',
    phone: initialLead?.phone ?? '',
    email: initialLead?.email ?? '',
    location: initialLead?.location ?? '',
    plotSize: initialLead?.project_size ?? '',
    projectType: 'Residential',
    notes: '',
  });
  const update = (name: keyof typeof data, value: string) => {
    setData((current) => ({ ...current, [name]: value }));
    setFeedback('');
  };
  const chooseLead = (value: string) => {
    const lead = leads.find((entry) => entry.id === value);
    setLeadId(lead?.id ?? '');
    setData((current) => ({
      ...current,
      clientName: lead?.name ?? '',
      phone: lead?.phone ?? '',
      email: lead?.email ?? '',
      location: lead?.location ?? '',
      plotSize: lead?.project_size ?? '',
    }));
    setFeedback('');
  };

  return (
    <div className="qs-create-start">
      <form
        className="qs-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!leadId || !industry) {
            setFeedback('Select a classified lead before continuing.');
            return;
          }
          setFeedback('');
          start(async () => {
            const result = await createStudioQuotation({
              ...data,
              leadId,
              currency: defaultCurrency,
            });
            if (!result.ok || !result.revisionId) {
              setFeedback(result.message);
              return;
            }
            // Industry always comes from the saved CRM lead, not the requested card.
            const allowedPackage =
              !initialCustomizedQuote &&
              initialPackageIndustry === industry &&
              /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(initialPackageId);
            const mode =
              industry === 'construction' && !initialCustomizedQuote
                ? 'sft'
                : 'custom';
            const route = new URLSearchParams({ mode, step: 'quote' });
            if (allowedPackage) route.set('package', initialPackageId);
            if (industry === 'construction' && selectedLead?.floorCount)
              route.set('floors', String(selectedLead.floorCount));
            if (initialCustomizedQuote) route.set('package', 'custom');
            router.push(
              '/dashboard/quotations/' +
                result.revisionId +
                '/studio?' +
                route.toString(),
            );
          });
        }}
      >
        <div className="qs-clean-form-title">
          <span className="qs-clean-form-icon" aria-hidden="true">
            ♙
          </span>
          <h2>Client &amp; Quotation Details</h2>
          {(initialCustomizedQuote || initialPackageId) && (
            <p className="qs-muted">
              {initialCustomizedQuote
                ? 'Custom Quote · Select a classified lead to start'
                : 'Package selected · Your lead determines the quote industry'}
            </p>
          )}
        </div>

        <div className="qs-source-lead">
          {leads.length > 0 ? (
            <label className="qs-clean-field qs-source-picker">
              <span className="qs-field-label">
                Select lead{' '}
                <span className="qs-field-required" aria-hidden="true">
                  *
                </span>
              </span>
              <select
                required
                value={leadId}
                onChange={(event) => chooseLead(event.target.value)}
              >
                <option value="">Choose a lead</option>
                {leads.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.lead_number}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="qs-source-guidance">
              No leads available.{' '}
              <Link href="/dashboard/crm/leads">Add a lead</Link> before
              creating a quote.
            </p>
          )}
          {industry === 'construction' && selectedLead?.floorCount && (
            <p className="qs-source-service" role="status">
              {selectedLead.floorCount} construction floors will be prefilled in
              the quotation editor. You can edit them for this project.
            </p>
          )}
          {initialPackageId &&
            industry &&
            initialPackageIndustry &&
            initialPackageIndustry !== industry && (
              <p className="qs-source-warning" role="status">
                The selected package belongs to {initialPackageIndustry}, but
                this lead is {industryName}. The quotation will use this lead’s
                industry instead.
              </p>
            )}
          {selectedLead && industry ? (
            <p className="qs-source-service" role="status">
              <span className="qs-source-indicator" aria-hidden="true" />{' '}
              {industryName} · Auto-detected from lead
            </p>
          ) : selectedLead ? (
            <p className="qs-source-warning" role="alert">
              This lead needs an industry classification.{' '}
              <Link href={'/dashboard/crm/leads/' + selectedLead.id}>
                Classify the lead
              </Link>{' '}
              to prepare its quote.
            </p>
          ) : leads.length > 0 ? (
            <p className="qs-source-guidance">
              Client and quotation details fill automatically from the selected
              lead.
            </p>
          ) : null}
        </div>

        <div className="qs-create-field-grid">
          <label className="qs-clean-field qs-field-full">
            <span className="qs-field-label">
              Client Name{' '}
              <span className="qs-field-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              required
              maxLength={200}
              placeholder="Enter client name"
              autoComplete="name"
              value={data.clientName}
              onChange={(event) => update('clientName', event.target.value)}
            />
          </label>
          <label className="qs-clean-field">
            <span className="qs-field-label">
              Phone Number{' '}
              <span className="qs-field-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="tel"
              required
              minLength={3}
              maxLength={40}
              autoComplete="tel"
              placeholder="Enter phone number"
              value={data.phone}
              onChange={(event) => update('phone', event.target.value)}
            />
          </label>
          <label className="qs-clean-field">
            <span className="qs-field-label">Email Address</span>
            <input
              type="email"
              maxLength={254}
              autoComplete="email"
              placeholder="Enter email address"
              value={data.email}
              onChange={(event) => update('email', event.target.value)}
            />
          </label>
          <label className="qs-clean-field qs-field-full">
            <span className="qs-field-label">Project Location</span>
            <input
              maxLength={200}
              placeholder="Enter project location"
              value={data.location}
              onChange={(event) => update('location', event.target.value)}
            />
          </label>
          <label className="qs-clean-field">
            <span className="qs-field-label">
              Plot Area / Property Configuration
            </span>
            <input
              maxLength={40}
              placeholder={
                industry === 'interior' ? '3BHK' : 'e.g. 200 sq yards'
              }
              value={data.plotSize}
              onChange={(event) => update('plotSize', event.target.value)}
            />
          </label>
          <label className="qs-clean-field">
            <span className="qs-field-label">Project Type</span>
            <select
              value={data.projectType}
              onChange={(event) => update('projectType', event.target.value)}
            >
              <option>Residential</option>
              <option>Commercial</option>
              <option>Renovation</option>
              <option>Extension</option>
            </select>
          </label>
          <label className="qs-clean-field qs-field-full qs-clean-notes">
            <span className="qs-field-label">Additional Notes (optional)</span>
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="Any special requirements, site details or notes…"
              value={data.notes}
              onChange={(event) => update('notes', event.target.value)}
            />
          </label>
        </div>
        {feedback && (
          <p role="alert" className="qs-clean-feedback">
            {feedback}
          </p>
        )}
        <div className="qs-clean-form-actions">
          <button
            className="qs-clean-next"
            type="submit"
            disabled={pending || !leadId || !industry}
          >
            {pending ? 'Creating quotation…' : 'Next →'}
          </button>
        </div>
      </form>
    </div>
  );
}
