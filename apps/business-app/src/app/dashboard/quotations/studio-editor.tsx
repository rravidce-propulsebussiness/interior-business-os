'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseSftEstimate } from '@business-os/core/sft-quotation';

type Tab = 'client' | 'quote' | 'files' | 'payments' | 'preview';
type Mode = 'sft' | 'custom' | 'pdf';

type QuotationLine = {
  id: string;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  optional: boolean;
};
type DocumentHeader = {
  branding: {
    name: string;
    phone: string;
    email: string;
    accent: string;
    tax_identifier: string;
  };
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  project: {
    name: string;
    code: string;
    site_address: { city: string; region: string };
  };
};

const steps: { id: Tab; title: string }[] = [
  { id: 'client', title: 'Client & Project' },
  { id: 'quote', title: 'Quote Builder' },
  { id: 'files', title: 'Specifications & Files' },
  { id: 'payments', title: 'Payments' },
  { id: 'preview', title: 'Preview & Share' },
];
const modes: { id: Mode; name: string; note: string; icon: string }[] = [
  {
    id: 'sft',
    name: 'Per sq ft (SFT)',
    note: 'Floor-wise area and rate',
    icon: '▦',
  },
  {
    id: 'custom',
    name: 'Custom BOQ / Materials',
    note: 'Room-wise or item-wise',
    icon: '▤',
  },
  {
    id: 'pdf',
    name: 'Upload existing PDF',
    note: 'Supporting documents',
    icon: '⇧',
  },
];

export function QuotationStudioEditor({
  revisionId,
  quoteNumber,
  revisionNumber,
  currency,
  status,
  industryKey,
  industryName,
  otherIndustries,
  header,
  lines,
  total,
  hasSavedPaymentPlan,
  brandingEditor,
  constructionEditor,
  interiorEditor,
  filesEditor,
  termsEditor,
  paymentEditor,
  sharingEditor,
  initialMode,
  initialStep,
  canEdit,
  canIssue,
  issueEditor,
}: {
  revisionId: string;
  quoteNumber: string;
  revisionNumber: number;
  currency: string;
  status: string;
  industryKey: string;
  industryName: string;
  otherIndustries: { key: string; name: string }[];
  header: DocumentHeader;
  lines: QuotationLine[];
  total: string;
  hasSavedPaymentPlan: boolean;
  brandingEditor: ReactNode;
  constructionEditor: ReactNode;
  interiorEditor: ReactNode;
  filesEditor: ReactNode;
  termsEditor: ReactNode;
  paymentEditor: ReactNode;
  sharingEditor: ReactNode;
  initialMode: Mode;
  initialStep: Tab;
  canEdit: boolean;
  canIssue: boolean;
  issueEditor: ReactNode;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Tab>(initialStep);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState('');
  const amount = Number(total);
  const price = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount)
    : currency + ' ' + total;
  const url = '/dashboard/quotations/' + revisionId;
  const isConstruction = industryKey === 'construction';
  const isInterior = industryKey === 'interior';
  const showMethod = mode === 'pdf' ? false : canEdit;
  return (
    <>
      <div className="qs-heading">
        <div className="qs-heading-label">
          <span className="qs-heading-icon">▤</span>
          <div>
            <h1>Quotation Studio</h1>
            <p>
              {quoteNumber} · Revision {revisionNumber} ·{' '}
              <span style={{ textTransform: 'capitalize' }}>{status}</span>
            </p>
          </div>
        </div>
        <div className="qs-toolbar">
          <button
            type="button"
            className="qs-btn"
            onClick={() => {
              router.refresh();
              setMessage(
                'Saved quotation items are up to date. Use the Save button in each editor before leaving.',
              );
            }}
          >
            ▣ Save Draft
          </button>
          <a
            className="qs-btn ghost"
            href={url + '/preview'}
            target="_blank"
            rel="noopener noreferrer"
          >
            ▧ Preview PDF
          </a>
          <button
            type="button"
            className="qs-btn primary"
            onClick={() => setStep('preview')}
          >
            ➤ {status === 'issued' ? 'Share Quote' : 'Issue & Share'}
          </button>
        </div>
      </div>
      <div className="qs-stepper" aria-label="Quotation steps">
        {steps.map(({ id, title }, i) => (
          <button
            key={id}
            type="button"
            className={'qs-step' + (step === id ? ' selected' : '')}
            onClick={() => setStep(id)}
          >
            <b>{i + 1}</b>
            <span>
              <strong>0{i + 1}</strong>
              <small>{title}</small>
            </span>
          </button>
        ))}
      </div>
      {message && (
        <div className="qs-message" role="status" style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}
      <div className="qs-studio-grid">
        <div className="qs-editor">
          <section className="qs-card">
            <div className="qs-sector-tabs">
              {[
                { key: 'construction', name: 'Construction', icon: '▦' },
                { key: 'interior', name: 'Interiors', icon: '▱' },
              ].map((item) =>
                industryKey === item.key ? (
                  <span
                    key={item.key}
                    className="qs-sector current"
                    aria-current="true"
                  >
                    {item.icon} {item.name}
                  </span>
                ) : (
                  <Link
                    key={item.key}
                    className="qs-sector"
                    href={'/dashboard/quotations/new?industry=' + item.key}
                    title="Start a new quotation in this industry"
                  >
                    {item.icon} {item.name}
                  </Link>
                ),
              )}
              {otherIndustries.length ? (
                <Link
                  href="/dashboard/quotations/new"
                  className="qs-sector"
                  title="Create quotation in another industry"
                >
                  ◈{' '}
                  {otherIndustries.length === 1
                    ? otherIndustries[0]?.name
                    : 'Other industries'}
                </Link>
              ) : (
                <span className="qs-sector" style={{ opacity: 0.6 }}>
                  ◈ More industries
                </span>
              )}
            </div>
            <div className="qs-divider" />
            <div className="qs-method-tabs">
              {modes.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    'qs-method' + (mode === option.id ? ' current' : '')
                  }
                  onClick={() => {
                    setMode(option.id);
                    if (option.id === 'pdf') setStep('files');
                    else setStep('quote');
                  }}
                >
                  <span className="qs-icon-chip">{option.icon}</span>
                  <span>
                    <strong>{option.name}</strong>
                    <small>{option.note}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="qs-card">
            <div className="qs-heading" style={{ marginBottom: 14 }}>
              <h2>Client &amp; Project Details</h2>
              <Link
                href="/dashboard/customers"
                className="qs-btn ghost"
                style={{ minHeight: 31 }}
              >
                Clients ↗
              </Link>
            </div>
            <div className="qs-fields">
              <label className="qs-field">
                Client name
                <input
                  readOnly
                  className="qs-readonly"
                  value={header.customer.name}
                />
              </label>
              <label className="qs-field">
                Phone
                <input
                  readOnly
                  className="qs-readonly"
                  value={header.customer.phone}
                />
              </label>
              <label className="qs-field">
                Email
                <input
                  readOnly
                  className="qs-readonly"
                  value={header.customer.email}
                />
              </label>
              <label className="qs-field qs-field-wide">
                Project
                <input
                  readOnly
                  className="qs-readonly"
                  value={header.project.name}
                />
              </label>
              <label className="qs-field">
                Project location
                <input
                  readOnly
                  className="qs-readonly"
                  value={[
                    header.project.site_address.city,
                    header.project.site_address.region,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                />
              </label>
            </div>
            {step === 'client' && (
              <p className="qs-note" style={{ marginTop: 12 }}>
                These customer and project fields were captured when the
                quotation draft was created. Existing quotations preserve their
                historical client snapshot. Use a new revision for revised
                commercial terms.
              </p>
            )}
          </section>

          {step === 'client' && brandingEditor}

          {step === 'quote' && (
            <>
              {showMethod && isConstruction && constructionEditor}
              {showMethod && (isInterior || !isConstruction) && interiorEditor}
              {!canEdit && (
                <p className="qs-note">
                  This revision is {status}. Create a draft revision before
                  modifying quotation prices.
                </p>
              )}
              <section className="qs-card">
                <h2>Saved quotation items</h2>
                {lines.length ? (
                  <div className="qs-line-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Item / description</th>
                          <th>Qty</th>
                          <th>Rate</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line.id}>
                            <td>
                              <strong>{line.name}</strong>
                              <div className="qs-muted">
                                {parseSftEstimate(line.description)
                                  ? 'Package · floor-wise costing and saved material specifications'
                                  : line.description.length > 190
                                    ? line.description.slice(0, 190) + '…'
                                    : line.description}
                              </div>
                            </td>
                            <td>
                              {line.quantity} {line.unit}
                            </td>
                            <td>
                              {currency} {line.rate}
                            </td>
                            <td>
                              <strong>
                                {currency} {line.amount}
                              </strong>
                              {line.optional && (
                                <div className="qs-badge">Optional</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="qs-info-box">
                    No items yet. Add your first floor, room or custom line
                    above.
                  </div>
                )}
                <div className="qs-totals-bar">
                  <span>Current quotation total</span>
                  <strong>{price}</strong>
                </div>
                {canEdit && (
                  <Link href={url} className="qs-btn" style={{ marginTop: 12 }}>
                    Advanced item editing, discounts &amp; revisions ↗
                  </Link>
                )}
              </section>
            </>
          )}

          {step === 'files' && (
            <>
              <section className="qs-card">
                <h2>Specifications, inclusions &amp; files</h2>
                <p className="qs-muted" style={{ marginBottom: 15 }}>
                  Your edited package inclusions print on their own PDF pages
                  after the floor-cost schedule. Upload any existing
                  specifications or plans below to append the original PDFs.
                  Set warranty and exclusions here. Use the Payments step for stage-wise milestones.
                </p>
                {termsEditor}
              </section>
              {filesEditor}
            </>
          )}

          {step === 'payments' && paymentEditor}

          {step === 'preview' && (
            <>
              <section className="qs-card">
                <h2>Review and share</h2>
                <p className="qs-muted" style={{ marginBottom: 14 }}>
                  This is the actual PDF generated with{' '}
                  <strong>{header.branding.name || industryName}</strong>{' '}
                  branding and saved quotation values.
                </p>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Link href="/dashboard/quotations/settings" className="qs-btn">
                    Edit company logo &amp; address ↗
                  </Link>
                  <button className="qs-btn" type="button" onClick={() => setStep('client')}>
                    Update branding for this draft ↗
                  </button>
                </div>
                <div className="qs-toolbar">
                  <button
                    type="button"
                    className="qs-btn ghost"
                    onClick={() => {
                      const preview =
                        document.querySelector<HTMLIFrameElement>(
                          '.qs-preview-frame',
                        );
                      if (preview?.contentWindow) preview.contentWindow.print();
                      else window.open(url + '/preview', '_blank', 'noopener');
                    }}
                  >
                    Print A4 design / Save as PDF
                  </button>
                  <a className="qs-btn primary" href={url + '/pdf'}>
                    ↓ Download quotation PDF
                  </a>
                  <a
                    className="qs-btn"
                    href={url + '/pdf?view=1'}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View complete PDF + attachments ↗
                  </a>
                </div>
                {!hasSavedPaymentPlan && (
                  <div className="qs-warning" style={{ marginTop: 16 }}>
                    <strong>Stage-wise payments are missing from this quotation.</strong>
                    <p className="mt-2 text-sm">
                      The Payments tab has editable suggestions, but they are
                      not included in the customer PDF until saved. Confirm the
                      exact stages and percentages before issuing or sharing.
                    </p>
                    {status === 'draft' && canEdit && (
                      <button type="button" className="qs-btn primary mt-3"
                        onClick={() => setStep('payments')}>
                        Set &amp; Save Stage-wise Payments
                      </button>
                    )}
                  </div>
                )}
                {status === 'draft' && canIssue && lines.length > 0 &&
                  hasSavedPaymentPlan && (
                  <div className="qs-warning" style={{ marginTop: 16 }}>
                    Check final amounts and attached annexures before issuing.
                    The issued revision is an immutable customer-facing snapshot.
                  </div>
                )}
                {status === 'draft' && canIssue && lines.length > 0 &&
                  hasSavedPaymentPlan && issueEditor}
                {status === 'draft' && lines.length === 0 && (
                  <p className="qs-note" style={{ marginTop: 13 }}>
                    Add at least one priced line before issuing.
                  </p>
                )}
              </section>
              {sharingEditor}
            </>
          )}
        </div>

        <aside className="qs-preview-pane">
          <div className="qs-preview-top">
            <span>
              ▤ PDF Preview <span className="qs-badge">A4 · Portrait</span>
            </span>
            <span className="qs-preview-actions">
              <a
                href={url + '/preview'}
                className="qs-btn"
                style={{ minHeight: 28, padding: '0 8px' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                ↗
              </a>
              <a
                href={url + '/pdf'}
                className="qs-btn"
                style={{ minHeight: 28, padding: '0 8px' }}
              >
                ↓
              </a>
            </span>
          </div>
          <iframe
            className="qs-preview-frame"
            title="Live customer quotation PDF preview"
            src={url + '/preview'}
            loading="lazy"
          />
          <div className="qs-info-box" style={{ marginTop: 10 }}>
            <strong>{header.branding.name || industryName}</strong> ·{' '}
            {quoteNumber}
            <span style={{ display: 'block', color: '#5a6985' }}>
              Company details, saved prices and source specifications are
              reflected in the preview.
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}
