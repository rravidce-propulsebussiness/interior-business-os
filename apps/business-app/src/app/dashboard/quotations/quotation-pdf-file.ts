'use client';

/** Reused by Leads and the quotation studio. A WhatsApp message URL does not
 * attach a PDF. Only Web Share Level 2 with a File shares the actual bytes. */
const MAX_PDF_BYTES = 60 * 1024 * 1024;

export function quotationPdfFilename(quoteNumber: string, kind: 'quotation'|'agreement' = 'quotation'): string {
  const base=quoteNumber.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) || 'Quotation';
  return base + (kind==='agreement' ? '-Agreement-Draft' : '') + '.pdf';
}

export async function fetchQuotationPdfFile(
  revisionId: string,
  quoteNumber: string,
  signal?: AbortSignal,
  kind: 'quotation'|'agreement' = 'quotation',
): Promise<File> {
  const path = '/dashboard/quotations/' + encodeURIComponent(revisionId) +
    '/pdf?view=1' + (kind==='agreement' ? '&document=agreement' : '') + '&_pdf=' + Date.now();
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    let details = '';
    try { details = (await response.text()).slice(0, 140); } catch { /* no-op */ }
    throw new Error(
      details && !/<(?:html|!doctype)/i.test(details) ? details :
        'Could not prepare the PDF (HTTP ' + response.status + ').',
    );
  }
  // Do not forward a legacy fallback PDF to WhatsApp. This header is emitted
  // only by the single premium-HTML browser print route.
  if (response.headers.get('X-Quotation-PDF-Template') !== 'premium-html-v1') {
    throw new Error('The website is serving an older PDF renderer. Deploy the latest Business OS build before sharing this quotation.');
  }
  const blob = await response.blob();
  // Content type may be generic behind a hosting proxy. The magic header is
  // definitive; reject HTML login/503 responses even if the status is 200.
  if (blob.size < 5 || blob.size > MAX_PDF_BYTES ||
    await blob.slice(0, 5).text() !== '%PDF-') {
    throw new Error('The PDF service did not return a valid quotation PDF.');
  }
  return new File([blob], quotationPdfFilename(quoteNumber,kind), {
    type: 'application/pdf',
  });
}

export function supportsPdfFileSharing(file: File): boolean {
  return typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });
}

export function sharePdfFile(file: File, number: string, kind: 'quotation'|'agreement' = 'quotation'): Promise<void> {
  // Invoke synchronously inside a real click handler. If fetch or a server
  // action is awaited first, Android may reject it (lost user activation).
  return navigator.share({
    files: [file],
    title: (kind==='agreement' ? 'Agreement draft ' : 'Quotation ') + number,
  });
}

export function downloadQuotationPdfFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
