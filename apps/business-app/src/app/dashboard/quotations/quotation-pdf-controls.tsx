'use client';

import { useCallback, useEffect, useState } from 'react';

const PDF_MAX_BYTES = 60 * 1024 * 1024;
const PDF_HEADER = '%PDF-';

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
  const filename = (quoteNumber.replace(/[^a-z0-9_-]/gi, '_') || 'Quotation') + '.pdf';

  const loadPdf = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(route, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.text()).slice(0, 160); } catch { /* ignore */ }
      throw new Error(response.status === 503
        ? 'PDF service is temporarily unavailable. Please try again.'
        : detail && !detail.includes('<') ? detail
          : 'Unable to generate the quotation PDF (HTTP ' + response.status + ').');
    }
    const blob = await response.blob();
    if (blob.size < 5 || blob.size > PDF_MAX_BYTES ||
      !blob.type.toLowerCase().includes('application/pdf')) {
      throw new Error('The server did not return a valid PDF.');
    }
    const header = await blob.slice(0, 5).text();
    if (header !== PDF_HEADER) throw new Error('The downloaded file is not a PDF.');
    return new File([blob], filename, { type: 'application/pdf' });
  }, [route, filename]);

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

  const downloadFile = (file: File) => {
    const href = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = href;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Allow mobile browsers to complete the download before revoking the blob.
    window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  };
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
    if (!navigator.share || !navigator.canShare?.({ files: [pdf] })) {
      downloadFile(pdf);
      setMessage('File sharing is not supported in this browser. PDF downloaded — attach it in WhatsApp.');
      return;
    }
    // This call MUST happen directly inside the click callback, without
    // awaiting a server action or a fetch that would lose user activation.
    void navigator.share({
      files: [pdf],
      title: 'Quotation ' + quoteNumber,
    }).then(() => setMessage('PDF sent to the selected app.'))
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
