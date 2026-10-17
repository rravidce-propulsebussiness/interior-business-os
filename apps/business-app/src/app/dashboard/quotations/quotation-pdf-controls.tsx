'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  fetchQuotationPdfFile, supportsPdfFileSharing,
  sharePdfFile, downloadQuotationPdfFile,
} from './quotation-pdf-file';

/** Three reliable PDF actions. Web Share shares a File (PDF attachment), not a
 * wa.me text link. Android's native share sheet lets the user choose WhatsApp.
 */
export function QuotationPdfControls({
  revisionId, version, quoteNumber, dirty, canShare,
}: {
  revisionId: string;
  version: number;
  quoteNumber: string;
  dirty: boolean;
  canShare: boolean;
}) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // A revision can be edited after opening the page; version-qualified
  // URLs keep Android PDF viewers from reopening an older cached document.
  const base = '/dashboard/quotations/' + revisionId + '/pdf';
  const route = base + '?view=1&version=' + version;
  const downloadRoute = base + '?version=' + version;


  const loadPdf = useCallback(
    async (signal?: AbortSignal) =>
      fetchQuotationPdfFile(revisionId, quoteNumber, signal),
    [revisionId, quoteNumber],
  );

  // Prepare once in advance so navigator.share() can be called synchronously
  // while Android still retains the user's tap activation.
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


  const sharePdf = () => {
    setMessage('');
    if (dirty) {
      setMessage('Save the latest quotation changes before sharing the PDF.');
      return;
    }
    if (!pdf || loadedVersion !== version) {
      // If prefetch has not finished, prepare the file. A second tap is
      // necessary because browsers require a fresh gesture for file sharing.
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
    // This call MUST happen directly inside the click callback, without
    // awaiting a server action or a fetch that would lose user activation.
    void sharePdfFile(pdf, quoteNumber)
      .then(() => setMessage('PDF handed to the selected app. Complete sending in WhatsApp.'))
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setMessage('Could not open the share sheet. Download the PDF and attach it in WhatsApp.');
      });
  };
  return (
    <>
      <div className="qs-work-pdf-actions">
        <a href={route} target="_blank" rel="noopener noreferrer"
          onClick={(event) => {
            if (dirty) { event.preventDefault(); setMessage('Save your latest changes before viewing the PDF.'); }
          }}>
          ◉ View PDF
        </a>
        <a href={downloadRoute}
          onClick={(event) => {
            if (dirty) { event.preventDefault(); setMessage('Save your latest changes before downloading the PDF.'); }
          }}>
          ↓ Download PDF
        </a>
        {canShare && <button type="button" disabled={loading} onClick={sharePdf}
          className="qs-work-whatsapp">
          {loading ? 'Preparing PDF…' : '➤ Share PDF to WhatsApp'}
        </button>}
      </div>
      <p className="qs-work-preview-note">
        Share sends the actual PDF file. Choose WhatsApp from your phone’s share sheet,
        then select the customer and tap Send.
      </p>
      {message && <p className="qs-work-pdf-message" role="status">{message}</p>}
    </>
  );
}
