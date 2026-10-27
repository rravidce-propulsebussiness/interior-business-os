import { expect, it, vi } from 'vitest';
import { renderQuotationDocument } from '@business-os/core/quotation-document';
import { validatePrintHtml } from '@business-os/shared/pdf';
import { quotationDocumentFixture } from '../../../../../../packages/core/src/quotation-document.fixture';
import { renderQuotationPdf, safeQuotationPrintHtml } from './pdf-renderer';
import { inlinePremiumConceptImages } from './inline-premium-concepts';

it('prints the exact premium quotation HTML, removing only external concept-image sources', () => {
  const saved = quotationDocumentFixture();
  const html = renderQuotationDocument(saved);
  expect(html).toContain('pb-cover');
  expect(html).toContain('images.unsplash.com');
  expect(() => validatePrintHtml(html)).toThrow(/PDF image must be/);
  const printable = safeQuotationPrintHtml(html);
  expect(printable).not.toContain('images.unsplash.com');
  expect(printable).toContain('data:image/png;base64,');
  expect(printable).toContain('pb-cover');
  expect(printable).toContain('pb-payment-page');
  expect(validatePrintHtml(printable)).toContain('pb-cover');
  // Preview is unchanged; PDF includes the same premium template/styles.
  expect(html).toContain('images.unsplash.com');
});

it('keeps tenant-uploaded logo and cover images in the exact premium PDF HTML', () => {
  const saved = quotationDocumentFixture();
  saved.header.branding.logo_data_uri = 'data:image/png;base64,AA==';
  saved.header.branding.cover_image_data_uri = 'data:image/jpeg;base64,AA==';
  const html = safeQuotationPrintHtml(renderQuotationDocument(saved));
  expect(html).toContain('data:image/jpeg;base64,AA==');
  expect(html).toContain('data:image/png;base64,AA==');
  expect(validatePrintHtml(html)).toContain(
    'Company-provided project photograph',
  );
});

it('does not silently replace a premium quotation with a different fallback PDF on a missing browser', async () => {
  vi.stubEnv('PDF_RENDERER', 'cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', '');
  vi.stubEnv('CF_BROWSER_API_TOKEN', '');
  try {
    const saved = quotationDocumentFixture();
    await expect(
      renderQuotationPdf(renderQuotationDocument(saved), saved),
    ).rejects.toMatchObject({
      name: 'PdfServiceError',
      code: 'PDF_RENDERER_UNAVAILABLE',
      status: 503,
    });
  } finally {
    vi.unstubAllEnvs();
  }
});

it('preserves saved stage payments and terms in the same premium preview/print markup', () => {
  const saved = quotationDocumentFixture();
  saved.totals.final_amount = '5550000.00';
  saved.terms =
    'Inclusions:\nCement and steel\n\nWarranty:\n10 years\n\n' +
    '[STAGE_PAYMENT_PLAN]\nAdvance|10.00\nRCC|60.00\nHandover|30.00\n[/STAGE_PAYMENT_PLAN]';
  const html = renderQuotationDocument(saved);
  const printable = safeQuotationPrintHtml(html);
  expect(printable).toContain('Proposed stage-wise payment schedule');
  expect(printable).toContain('Advance');
  expect(printable).toContain('RCC');
  expect(printable).toContain('Handover');
  expect(printable).toContain('Terms &amp; Inclusions');
  expect(printable).toContain('10 years');
  expect(printable).toContain('55,50,000');
  expect(validatePrintHtml(printable)).toContain('pb-payment-page');
});

it('uses the same embedded concept photography for preview and secure premium PDF output', async () => {
  const sample = Buffer.alloc(32);
  sample.write('RIFF', 0, 'ascii');
  sample.write('WEBP', 8, 'ascii');
  const stub = vi.fn(
    async () =>
      new Response(new Uint8Array(sample), {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': String(sample.length),
        },
      }),
  );
  vi.stubGlobal('fetch', stub);
  try {
    const html = renderQuotationDocument(quotationDocumentFixture());
    const shared = await inlinePremiumConceptImages(html);
    expect(shared).not.toContain('images.unsplash.com');
    expect(shared).toContain('data:image/webp;base64,');
    expect(validatePrintHtml(shared)).toContain('pb-cover');
    expect(safeQuotationPrintHtml(shared)).toBe(shared);
    expect(stub).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
