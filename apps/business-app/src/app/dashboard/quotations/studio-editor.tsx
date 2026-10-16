'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { parseSftEstimate } from '@business-os/core/sft-quotation';

type Tab = 'quote' | 'files' | 'payments' | 'preview';

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
  { id: 'quote', title: 'Estimate & Specifications' },
  { id: 'files', title: 'Terms & Inclusions' },
  { id: 'payments', title: 'Payment Schedule' },
];

export function QuotationStudioEditor({
  revisionId,
  quoteNumber,
  revisionNumber,
  revisionVersion,
  currency,
  status,
  industryKey,
  industryName,
  header,
  lines,
  total,
  hasSavedPaymentPlan,
  previewHtml,
  constructionEditor,
  interiorEditor,
  termsEditor,
  paymentEditor,
  sharingEditor,
  initialStep,
  canEdit,
  canIssue,
  issueEditor,
  reviseEditor,
}: {
  revisionId: string;
  quoteNumber: string;
  revisionNumber: number;
  revisionVersion: number;
  currency: string;
  status: string;
  industryKey: string;
  industryName: string;
  header: DocumentHeader;
  lines: QuotationLine[];
  total: string;
  hasSavedPaymentPlan: boolean;
  previewHtml?: string | undefined;
  constructionEditor: ReactNode;
  interiorEditor: ReactNode;
  termsEditor: ReactNode;
  paymentEditor: ReactNode;
  sharingEditor: ReactNode;
  initialStep: Tab;
  canEdit: boolean;
  canIssue: boolean;
  issueEditor: ReactNode;
  reviseEditor: ReactNode;
}) {
  const [step, setStep] = useState<Tab>(initialStep);
  const [message, setMessage] = useState('');
  // A successful child save increments the version via the authoritative
  // server action; clear transient 'Saving…' only after that acknowledgement.
  useEffect(() => { setMessage(''); }, [revisionVersion]);
  const saveCurrent = () => {
    if (!canEdit) {
      setMessage('This shared quotation is protected. Start a new revision to edit it.');
      return;
    }
    const saveButton = document.querySelector<HTMLButtonElement>(
      '[data-studio-save="' + step + '"]',
    );
    if (!saveButton) {
      setMessage('No pending changes in this section. Your quotation is saved.');
      return;
    }
    if (saveButton.disabled) {
      setMessage('Complete the required estimate or payment details before saving.');
      return;
    }
    if (saveButton.form && !saveButton.form.reportValidity()) {
      setMessage('Complete the highlighted fields before saving.');
      return;
    }
    setMessage('Saving this section…');
    // Click the actual permission-checked child editor action, not a fake
    // router.refresh(). The child displays backend success/error feedback.
    saveButton.click();
  };
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
  const showMethod = canEdit;
  return (
    <>
      {!(isConstruction && canEdit && step === 'quote') && <div className="qs-heading qs-studio-hero qs-studio-clean-header">
        <div className="qs-heading-label">
          <span className="qs-heading-icon">▤</span>
          <div>
            <h1>{industryName} Quote</h1>
            <p className="qs-hero-meta">
              {quoteNumber} · Revision {revisionNumber} ·{' '}
              <span className="qs-saved-pill">{status === 'issued' ? 'Shared' : 'Saved'}</span>
            </p>
            <p className="qs-hero-client">Prepared for <strong>{header.customer.name}</strong></p>
            <div className="qs-hero-total"><small>Total project cost</small><strong>{price}</strong></div>
          </div>
        </div>
        <div className="qs-toolbar qs-studio-actions" aria-label="Quotation actions">
          <button type="button" className="qs-btn qs-top-save" onClick={saveCurrent}>
            ▣ Save
          </button>
          <button type="button" className="qs-btn primary qs-top-preview"
            onClick={() => { setStep('preview'); setMessage(''); }}>
            ◉ Preview &amp; Share
          </button>
        </div>
      </div>}
      <nav className="qs-simple-tabs" aria-label="Quotation sections">
        {steps.map(({ id, title }) => (
          <button type="button" key={id}
            className={'qs-simple-tab' + (step === id ? ' active' : '')}
            aria-current={step === id ? 'page' : undefined}
            onClick={() => { setStep(id); setMessage(''); }}>
            {title}
          </button>
        ))}
      </nav>
      {message && (
        <div className="qs-message" role="status" style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}
      <div className="qs-studio-grid">
        <div className="qs-editor">
          {step === 'quote' && (
            <>
              {showMethod && isConstruction && constructionEditor}
              {showMethod && (isInterior || !isConstruction) && interiorEditor}
              {!canEdit && (
                <p className="qs-note">
                  This shared version is protected. Create a new revision before
                  modifying quotation prices.
                </p>
              )}
              {!canEdit && reviseEditor}
              {!isConstruction && <section className="qs-card">
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
              </section>}
            </>
          )}

          {step === 'files' && termsEditor}

          {step === 'payments' && paymentEditor}

          {step === 'preview' && (
            <>
              <section className="qs-card" id="qs-preview-share">
                <h2>Preview &amp; Share</h2>
                <p className="qs-muted" style={{ marginBottom: 14 }}>
                  This is the actual PDF generated with{' '}
                  <strong>{header.branding.name || industryName}</strong>{' '}
                  branding and saved quotation values.
                </p>
                <p className="qs-muted" style={{marginBottom: 12}}>
                  Preview contains saved amounts and specifications only.
                  Save any edits before sharing.
                </p>
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
                    Check final amounts and attached annexures before sharing.
                    Shared versions are preserved for your customer's records.
                  </div>
                )}
                {status === 'draft' && canIssue && lines.length > 0 &&
                  hasSavedPaymentPlan && issueEditor}
                {status === 'draft' && lines.length === 0 && (
                  <p className="qs-note" style={{ marginTop: 13 }}>
                    Add at least one priced line before enabling customer sharing.
                  </p>
                )}
              </section>
              {sharingEditor}
            </>
          )}
        </div>

        {!isConstruction && <aside className="qs-preview-pane">
          <div className="qs-preview-top">
            <span>
              ▤ PDF Preview <span className="qs-badge">A4 · Portrait</span>
            </span>
            
          </div>
          <iframe
            className="qs-preview-frame"
            title="Live customer quotation PDF preview"
            srcDoc={previewHtml}
            src={previewHtml ? undefined : url + '/preview'}
            sandbox=""
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
        </aside>}
      </div>
    </>
  );
}
