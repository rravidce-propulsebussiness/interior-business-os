'use client';

import { useRef, useState } from 'react';
import { createWhatsAppPdfShare } from '../../quotations/sharing-actions';

function whatsappPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  // Stored local 10-digit Indian numbers need a dialling country code.
  const international = digits.length === 10 ? '91' + digits :
    digits.length === 11 && digits.startsWith('0') ? '91' + digits.slice(1) : digits;
  return /^\d{11,15}$/.test(international) ? international : '';
}

export function LeadQuotePreview({
  revisionId, number, status, amount, shared = false, canShare = false,
}: {
  revisionId: string;
  number: string;
  status: string | null;
  amount: string | null;
  shared?: boolean;
  canShare?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [whatsappHref, setWhatsappHref] = useState('');
  const [customerPdfUrl, setCustomerPdfUrl] = useState('');

  const base = '/dashboard/quotations/' + encodeURIComponent(revisionId);
  const visibleStatus = shared ? 'Shared' :
    status === 'issued' ? 'Ready to share' :
    status === 'superseded' ? 'Previous version' :
    status === 'cancelled' ? 'Archived' : 'Draft';
  const formatted = amount !== null && Number.isFinite(Number(amount))
    ? '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : null;

  async function openPreview() {
    if (!dialog.current) return;
    if (!dialog.current.open) dialog.current.showModal();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setPreviewError('');
    setHtml('');
    try {
      // Inline HTML avoids the X-Frame-Options DENY restriction inherited by
      // authenticated preview routes. It never exposes a public quotation URL.
      const response = await fetch(base + '/preview', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'text/html' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403
        ? 'Preview access expired. Sign in again or open the quotation.'
        : 'Could not load the quotation preview (HTTP ' + response.status + ').');
      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('text/html')) throw new Error('The preview response was not HTML.');
      const markup = await response.text();
      if (!/<html[\s>]/i.test(markup))
        throw new Error('The server did not return a quotation preview.');
      if (!controller.signal.aborted) setHtml(markup);
    } catch (error) {
      if (!controller.signal.aborted) setPreviewError(
        error instanceof Error ? error.message : 'Unable to load preview.',
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function closePreview() {
    activeRequest.current?.abort();
    dialog.current?.close();
    setHtml('');
    setLoading(false);
  }

  async function shareOnWhatsApp() {
    if (!canShare || sharing) return;
    // The server finalizes draft quotes before creating a public link. The
    // owner must explicitly approve that irreversible transition.
    if (status === 'draft' && !window.confirm(
      'Sharing this draft will finalize the quotation and create a secure customer PDF link. Continue?',
    )) return;
    setSharing(true);
    setShareError('');
    setWhatsappHref('');
    try {
      const result = await createWhatsAppPdfShare(revisionId);
      if (!result.ok || !result.token)
        throw new Error(result.message || 'Could not create a secure PDF link.');
      const pdfUrl = window.location.origin + '/q/' + result.token + '/pdf';
      setCustomerPdfUrl(pdfUrl);
      const name = (result.clientName ?? '').trim();
      const message =
        (name ? 'Hello ' + name + ',\n\n' : 'Hello,\n\n') +
        'Please find quotation ' + (result.quoteNumber || number) +
        ' (PDF) at the secure link below:\n' + pdfUrl +
        '\n\nPlease review it and let us know if you have any questions.';
      const digits = whatsappPhone(result.recipientPhone ?? '');
      const url = digits ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message)
        : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(message);
      setWhatsappHref(url);
      // A real WhatsApp conversation opens; the user selects Send.
      // WhatsApp receives a secure customer PDF URL, not a dashboard session URL.
      window.location.assign(url);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'WhatsApp sharing is unavailable.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="crm-quote-summary">
      <div className="crm-quote-summary-top">
        <strong title={number}>{number}</strong>
        <span className={shared ? 'crm-quote-shared' : 'crm-quote-status'}>
          {visibleStatus}
        </span>
      </div>
      {formatted && <strong className="crm-quote-amount">{formatted}</strong>}
      <div className="crm-quote-buttons">
        <button type="button" onClick={() => void openPreview()}>Preview</button>
        <a href={base}>Open</a>
        {canShare && (status === 'draft' || status === 'issued') &&
          <button type="button" className="crm-quote-whatsapp"
            disabled={sharing} onClick={() => void shareOnWhatsApp()}>
            {sharing ? 'Preparing secure PDF…' : 'WhatsApp PDF'}
          </button>}
      </div>
      {shareError && <p className="crm-quote-share-error" role="alert">{shareError}</p>}
      {whatsappHref && <p className="crm-quote-share-ready" role="status">
        Secure PDF link created. <a href={whatsappHref} target="_blank"
          rel="noopener noreferrer">Open WhatsApp</a>
        {customerPdfUrl && <> · <a href={customerPdfUrl} target="_blank"
          rel="noopener noreferrer">View customer PDF</a></>}
      </p>}

      <dialog ref={dialog} className="crm-quote-dialog"
        aria-label={'Quotation preview ' + number}
        onClose={() => { activeRequest.current?.abort(); setHtml(''); }}>
        <div className="crm-quote-dialog-head">
          <div>
            <strong>{number}</strong>
            <span>{shared ? 'Shared with customer' : 'Company quotation'}
              {formatted ? ' · ' + formatted : ''}</span>
          </div>
          <button type="button" onClick={closePreview} aria-label="Close quotation preview">×</button>
        </div>
        {loading && <div className="crm-quote-preview-state" role="status">
          Loading saved quotation preview…
        </div>}
        {previewError && <div className="crm-quote-preview-state" role="alert">
          <strong>Preview unavailable</strong>
          <p>{previewError}</p>
          <button type="button" onClick={() => void openPreview()}>Try again</button>
          <a href={base + '/preview'} target="_blank"
            rel="noopener noreferrer">Open full preview ↗</a>
        </div>}
        {html && !loading && <iframe srcDoc={html} sandbox=""
          title={'Preview ' + number} />}
        <div className="crm-quote-dialog-footer">
          <a href={base + '/preview'} target="_blank"
            rel="noopener noreferrer">Full Preview</a>
          <a href={base + '/pdf?view=1'} target="_blank"
            rel="noopener noreferrer">View PDF</a>
          <a href={base}>Open quotation</a>
          <button type="button" onClick={closePreview}>Close</button>
        </div>
      </dialog>
    </div>
  );
}
