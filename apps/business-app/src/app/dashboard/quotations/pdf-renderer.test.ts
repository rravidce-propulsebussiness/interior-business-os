import { expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderQuotationDocument } from '@business-os/core/quotation-document';
import { validatePrintHtml } from '@business-os/shared/pdf';
import { quotationDocumentFixture } from '../../../../../../packages/core/src/quotation-document.fixture';
import { renderQuotationPdf, safeQuotationPrintHtml } from './pdf-renderer';

it('reproduces and fixes the quotation PDF preflight failure for public concept images', () => {
  const saved = quotationDocumentFixture();
  const html = renderQuotationDocument(saved);

  // This was the bug: the live brochure shows hosted concept photos,
  // while PDF preflight explicitly rejects every remote image source.
  expect(html).toContain('images.unsplash.com');
  expect(() => validatePrintHtml(html)).toThrow(/PDF image must be/);

  const printHtml = safeQuotationPrintHtml(html);
  expect(printHtml).not.toContain('images.unsplash.com');
  expect(printHtml).toContain('data:image/png;base64,');
  expect(validatePrintHtml(printHtml)).toContain('pb-cover');
  // Rendering a PDF must not mutate the browser-visible premium template.
  expect(html).toContain('images.unsplash.com');
});

it('does not replace tenant-uploaded data URI branding', () => {
  const saved = quotationDocumentFixture();
  saved.header.branding.logo_data_uri = 'data:image/png;base64,AA==';
  saved.header.branding.cover_image_data_uri = 'data:image/jpeg;base64,AA==';
  const sanitized = safeQuotationPrintHtml(renderQuotationDocument(saved));
  expect(sanitized).toContain('data:image/jpeg;base64,AA==');
  expect(sanitized).toContain('data:image/png;base64,AA==');
  expect(validatePrintHtml(sanitized)).toContain('Company-provided project photograph');
});

it('generates a genuine multipage quotation PDF when the production browser renderer is unavailable', async () => {
  // Reproduce a typical Hostinger deployment without configured browser rendering.
  vi.stubEnv('PDF_RENDERER', 'cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', '');
  vi.stubEnv('CF_BROWSER_API_TOKEN', '');
  try {
    const saved = quotationDocumentFixture();
    const html = renderQuotationDocument(saved);
    const bytes = await renderQuotationPdf(html, saved);
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toContain(saved.number);
  } finally {
    vi.unstubAllEnvs();
  }
});
