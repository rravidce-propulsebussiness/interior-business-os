'use client';

import { useState, type ReactNode } from 'react';
import { parseSftEstimate } from '@business-os/core/sft-quotation';

type Tab = 'quote' | 'files' | 'payments';

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
  { id: 'quote', title: 'Scope' },
  { id: 'files', title: 'Terms & Inclusions' },
  { id: 'payments', title: 'Payment Schedule' },
];

export function QuotationStudioEditor({
  revisionId,
  quoteNumber,
  revisionVersion,
  currency,
  industryKey,
  industryName,
  header,
  lines,
  total,
  previewHtml,
  constructionEditor,
  interiorEditor,
  termsEditor,
  paymentEditor,
  initialStep,
  canEdit,
  reviseEditor,
}: {
  revisionId: string;
  quoteNumber: string;
  revisionNumber: number;
  revisionVersion: number;
  currency: string;
  industryKey: string;
  industryName: string;
  header: DocumentHeader;
  lines: QuotationLine[];
  total: string;
  previewHtml?: string | undefined;
  constructionEditor: ReactNode;
  interiorEditor: ReactNode;
  termsEditor: ReactNode;
  paymentEditor: ReactNode;
  initialStep: Tab;
  canEdit: boolean;
  reviseEditor: ReactNode;
}) {
  const [step, setStep] = useState<Tab>(initialStep);
  const amount = Number(total);
  const price = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency', currency, maximumFractionDigits: 2,
      }).format(amount)
    : currency + ' ' + total;
  const url = '/dashboard/quotations/' + revisionId;
  const isConstruction = industryKey === 'construction';
  const isInterior = industryKey === 'interior';
  const showMethod = canEdit;
  return (
    <>
      <nav className="qs-simple-tabs" aria-label="Quotation sections">
        {steps.map(({ id, title }) => (
          <button type="button" key={id}
            className={'qs-simple-tab' + (step === id ? ' active' : '')}
            aria-current={step === id ? 'page' : undefined}
            onClick={() => setStep(id)}>
            {title}
          </button>
        ))}
      </nav>
      <div className={'qs-studio-grid' + (step === 'payments' ? ' qs-studio-grid-full' : '')}>
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


        </div>

        {!isConstruction && step !== 'payments' && <aside className="qs-preview-pane">
          <div className="qs-preview-top">
            <span>
              ▤ PDF Preview <span className="qs-badge">A4 · Portrait</span>
            </span>
            
          </div>
          <iframe
            className="qs-preview-frame"
            title="Live customer quotation PDF preview"
            srcDoc={previewHtml}
            src={previewHtml ? undefined : url + '/preview?version=' + revisionVersion}
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
      <div className="qs-studio-bottom-actions">
        <a className="qs-btn" href={url + '/preview'} target="_blank" rel="noopener noreferrer">
          View saved quotation ↗
        </a>
      </div>
    </>
  );
}
