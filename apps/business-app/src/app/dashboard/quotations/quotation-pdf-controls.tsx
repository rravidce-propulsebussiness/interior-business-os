'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchQuotationPdfFile, supportsPdfFileSharing,
  sharePdfFile, downloadQuotationPdfFile,
} from './quotation-pdf-file';

/** Quote and agreement PDFs use one saved revision. The quotation omits
 * agreement clauses and the payment schedule; the linked agreement draft
 * includes both without changing the saved milestone groups. */
function PdfActions({
  revisionId, version, quoteNumber, dirty, canShare, kind,
}: {
  revisionId: string; version: number; quoteNumber: string; dirty: boolean;
  canShare: boolean; kind: 'quotation'|'agreement';
}) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const base = '/dashboard/quotations/' + revisionId + '/pdf';
  const params = kind==='agreement' ? '&document=agreement' : '';
  const route = base + '?view=1&version=' + version + params;
  const downloadRoute = base + '?version=' + version + params;
  const agreement = kind==='agreement';
  const title = agreement ? 'Agreement draft' : 'Quotation';

  const loadPdf = useCallback(
    async (signal?: AbortSignal) => fetchQuotationPdfFile(revisionId, quoteNumber, signal, kind),
    [revisionId, quoteNumber, kind],
  );

  useEffect(() => {
    setPdf(null);
    setLoadedVersion(null);
    if (dirty) return;
    const controller = new AbortController();
    void loadPdf(controller.signal)
      .then(file => { if (!controller.signal.aborted) { setPdf(file); setLoadedVersion(version); } })
      .catch(() => { /* The user can retry from any button. */ });
    return () => controller.abort();
  }, [loadPdf, version, dirty]);

  const share = () => {
    setMessage('');
    if (dirty) {
      setMessage('Save the latest quotation changes before sharing the PDF.');
      return;
    }
    if (!pdf || loadedVersion !== version) {
      setLoading(true);
      void loadPdf().then(file => {
        setPdf(file);
        setLoadedVersion(version);
        setMessage('PDF ready. Tap Share PDF again and choose WhatsApp.');
      }).catch(error => {
        setMessage(error instanceof Error ? error.message : 'Could not prepare PDF.');
      }).finally(() => setLoading(false));
      return;
    }
    if (!supportsPdfFileSharing(pdf)) {
      downloadQuotationPdfFile(pdf);
      setMessage('File sharing is not supported in this browser. PDF downloaded — attach it in WhatsApp.');
      return;
    }
    void sharePdfFile(pdf, quoteNumber, kind)
      .then(() => setMessage('PDF handed to the selected app. Complete sending in WhatsApp.'))
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setMessage('Could not open the share sheet. Download the PDF and attach it in WhatsApp.');
      });
  };

  return <section className={'qs-work-pdf-document qs-work-pdf-'+kind} aria-label={title+' PDF'}>
    <h4>{title} PDF</h4>
    <div className="qs-work-pdf-actions">
      <a href={route} target="_blank" rel="noopener noreferrer"
        onClick={event => { if (dirty) { event.preventDefault(); setMessage('Save your latest quotation changes before viewing the PDF.'); } }}>
        {agreement ? 'View Agreement PDF' : '◉ View PDF'}
      </a>
      <a href={downloadRoute}
        onClick={event => { if (dirty) { event.preventDefault(); setMessage('Save your latest quotation changes before downloading the PDF.'); } }}>
        {agreement ? 'Download Agreement PDF' : '↓ Download PDF'}
      </a>
      {canShare && <button type="button" disabled={loading} onClick={share}
        className="qs-work-whatsapp">
        {loading ? 'Preparing PDF…' : agreement ? 'Share Agreement PDF to WhatsApp' : '➤ Share PDF to WhatsApp'}
      </button>}
    </div>
    <p className="qs-work-preview-note">{agreement
      ? 'This draft uses the linked quotation, its unchanged grouped payment schedule and saved agreement clauses. It does not record a signature, approval, invoice or receipt.'
      : 'Quotation PDF contains pricing, scope and specifications. Agreement clauses and grouped payment milestones are available in the separate Agreement PDF.'}</p>
    {message && <p className="qs-work-pdf-message" role="status">{message}</p>}
  </section>;
}

export function QuotationPdfControls(props: {
  revisionId: string; version: number; quoteNumber: string; dirty: boolean; canShare: boolean;
}) {
  return <div className="qs-work-pdf-documents" aria-label="Quotation documents">
    <PdfActions {...props} kind="quotation" />
    <PdfActions {...props} kind="agreement" />
  </div>;
}
