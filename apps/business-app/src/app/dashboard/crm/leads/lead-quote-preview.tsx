'use client';

import { useRef, useState } from 'react';
import { leadQuoteLabel } from './lead-quote-display';
import { authorizeWhatsAppPdfAttachment } from '../../quotations/sharing-actions';
import {
  fetchQuotationPdfFile, supportsPdfFileSharing, sharePdfFile,
  downloadQuotationPdfFile,
} from '../../quotations/quotation-pdf-file';

export function LeadQuotePreview({
  revisionId, number, status, amount, shared = false, canShare = false,
  newQuoteHref,
}: {
  revisionId: string;
  number: string;
  status: string | null;
  amount: string | null;
  shared?: boolean;
  canShare?: boolean;
  newQuoteHref?: string | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [preparedPdf, setPreparedPdf] = useState<File | null>(null);

  const base = '/dashboard/quotations/' + encodeURIComponent(revisionId);
  const visibleStatus = leadQuoteLabel(status, shared);
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

  function shareOnWhatsApp() {
    if (!canShare || sharing) return;
    setShareError('');
    if (preparedPdf) {
      if (!supportsPdfFileSharing(preparedPdf)) {
        downloadQuotationPdfFile(preparedPdf);
        setShareMessage(
          'PDF downloaded. Open the customer’s WhatsApp chat and attach this PDF from Downloads.',
        );
        return;
      }
      // This MUST be called during the tap; fetching the PDF first would lose
      // Android's transient user activation and silently fail.
      void sharePdfFile(preparedPdf, number)
        .then(() => setShareMessage(
          'PDF handed to the selected app. Complete sending in WhatsApp.',
        ))
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setShareError('Could not open the share sheet. Download and attach the PDF in WhatsApp.');
        });
      return;
    }
    if (status === 'draft' && !window.confirm(
      'Prepare this saved quotation for customer sharing? It will be finalized before the PDF is shared.',
    )) return;
    setSharing(true);
    setShareMessage('');
    void (async () => {
      try {
        const result = await authorizeWhatsAppPdfAttachment(revisionId);
        if (!result.ok) throw new Error(result.message);
        const file = await fetchQuotationPdfFile(revisionId, number);
        setPreparedPdf(file);
        setShareMessage(supportsPdfFileSharing(file)
          ? 'PDF ready. Tap WhatsApp PDF again, choose WhatsApp and select the customer.'
          : 'PDF ready. Tap Download PDF, then attach it in the customer’s WhatsApp chat.');
      } catch (error) {
        setShareError(error instanceof Error ? error.message : 'Could not prepare the PDF.');
      } finally {
        setSharing(false);
      }
    })();
  }

  // Do not represent an unpriced private revision as a ₹0 quotation.
  // Reuse this state across the lead list, drawer, board and history.
  if (!shared && status === 'draft' && (!amount || Number(amount) <= 0)) {
    return <div className="crm-quote-summary crm-quote-incomplete">
      <span>Quotation not priced yet</span>
      <a href={base + '/studio?step=quote'}>Continue quotation</a>
    </div>;
  }

  return (
    <div className="crm-quote-summary">
      <div className="crm-quote-summary-heading">
        <span>Latest quotation</span>
        <span className={shared ? 'crm-quote-shared' : 'crm-quote-status'}>
          {visibleStatus}
        </span>
      </div>
      <div className="crm-quote-summary-top">
        <strong title={number}>{number}</strong>
      </div>
      {formatted && <strong className="crm-quote-amount">{formatted}</strong>}
      <div className="crm-quote-buttons">
        <button type="button" onClick={() => void openPreview()}>Preview</button>
        <a href={base}>Open</a>
        {canShare && (status === 'draft' || status === 'issued') &&
          <button type="button" className="crm-quote-whatsapp"
            disabled={sharing} onClick={() => void shareOnWhatsApp()}>
            {sharing ? 'Preparing PDF…' : preparedPdf ? 'Share PDF File' : 'WhatsApp PDF'}
          </button>}
        {newQuoteHref && <a className="crm-quote-new-inline"
          title="Create another quotation for this lead" href={newQuoteHref}>
          + New
        </a>}
      </div>
      {shareError && <p className="crm-quote-share-error" role="alert">{shareError}</p>}
      {shareMessage && <div className="crm-quote-share-ready" role="status">
        <p>{shareMessage}</p>
        {preparedPdf && <button type="button"
          onClick={() => downloadQuotationPdfFile(preparedPdf)}>Download PDF</button>}
      </div>}

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
