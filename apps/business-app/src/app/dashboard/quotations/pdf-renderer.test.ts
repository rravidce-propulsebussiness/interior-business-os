import { expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderQuotationDocument } from '@business-os/core/quotation-document';
import { validatePrintHtml } from '@business-os/shared/pdf';
import { quotationDocumentFixture } from '../../../../../../packages/core/src/quotation-document.fixture';
import { renderQuotationPdf, safeQuotationPrintHtml, savedPdfPaymentRows } from './pdf-renderer';

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

it('allocates saved milestone percentages to exact rupee values for the fallback PDF', () => {
  const saved=[
    'Inclusions:', 'Structural construction', '',
    '[STAGE_PAYMENT_PLAN]', 'Agreement|10.00', 'RCC|60.00',
    'Handover|30.00', '[/STAGE_PAYMENT_PLAN]',
  ].join('\n');
  expect(savedPdfPaymentRows(saved,'5550000.00')).toEqual([
    {name:'Agreement',percent:10,amount:'5,55,000'},
    {name:'RCC',percent:60,amount:'33,30,000'},
    {name:'Handover',percent:30,amount:'16,65,000'},
  ]);
  expect(savedPdfPaymentRows('No milestones approved','5550000.00')).toEqual([]);
  const fractional=[
    '[STAGE_PAYMENT_PLAN]','Deposit|33.33','Structure|33.33',
    'Handover|33.34','[/STAGE_PAYMENT_PLAN]',
  ].join('\n');
  const rows=savedPdfPaymentRows(fractional,'101.00');
  expect(rows).toHaveLength(3);
  expect(rows.reduce((sum,row)=>sum+Number(row.amount.replaceAll(',','')),0)).toBe(101);
});

it('generates a PDF with saved payment conditions through the local fallback',async()=>{
  vi.stubEnv('PDF_RENDERER','cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID','');
  vi.stubEnv('CF_BROWSER_API_TOKEN','');
  try{
    const doc=quotationDocumentFixture();
    doc.totals.final_amount='5550000.00';
    doc.terms='Inclusions:\nCement and steel\n\nWarranty:\n10 years\n\n'+
      '[STAGE_PAYMENT_PLAN]\nAdvance|10.00\nRCC|60.00\nHandover|30.00\n[/STAGE_PAYMENT_PLAN]';
    const pdf=await renderQuotationPdf(renderQuotationDocument(doc),doc);
    const loaded=await PDFDocument.load(pdf);
    expect(pdf.subarray(0,5).toString('ascii')).toBe('%PDF-');
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  }finally{vi.unstubAllEnvs();}
});
