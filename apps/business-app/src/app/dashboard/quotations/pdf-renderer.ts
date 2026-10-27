import { renderPdf } from '@business-os/shared/pdf';
import {
  customerDocumentSchema,
  type CustomerDocument,
} from '@business-os/core/quotation-document';

/**
 * Two published concept photographs are decorative and externally hosted.
 * Quotation PDF printing must not make HTTP requests, so strip only these
 * explicitly known remote URLs. Tenant-provided embedded branding stays
 * untouched. The same premium brochure layout and saved revision are used
 * for the HTML preview, browser-generated PDF, download, and WhatsApp.
 */
const transparentPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';

export function safeQuotationPrintHtml(html: string): string {
  return html.replace(
    /src=(["'])https:\/\/images\.unsplash\.com\/photo-(?:1756435292384-1bf32eff7baf|1751945965597-71171ec7a458)[^"']*\1/gi,
    'src="' + transparentPng + '"',
  );
}

/**
 * Strict premium-only renderer. Never fall back to the independent pdf-lib
 * layout: that is the source of the mismatch between preview and WhatsApp.
 *
 * Browser rendering is required. A missing renderer fails visibly, rather
 * than misrepresenting a different document as the approved premium quote.
 */
export async function renderQuotationPdf(
  html: string,
  document?: CustomerDocument,
): Promise<Buffer> {
  if (document) {
    customerDocumentSchema.parse(document);
  }
  return renderPdf(safeQuotationPrintHtml(html), {
    brochure: true,
    ...(document
      ? {
          title: 'Quotation ' + document.number + ' R' + document.revision,
          author: document.header.branding.name,
        }
      : {}),
  });
}
