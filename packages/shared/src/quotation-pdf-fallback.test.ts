import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderQuotationFallbackPdf } from './quotation-pdf-fallback';

it('renders a complete quotation PDF without Chromium on the host', async () => {
  const pdf = await renderQuotationFallbackPdf({
    company: 'SG Homes',
    companyAddress: 'Hyderabad',
    companyContact: 'office@example.test',
    customer: 'Ramya',
    customerContact: '9000000000',
    project: 'Construction proposal',
    site: 'Kothapet',
    number: 'Q-2026-000010',
    revision: 1,
    validUntil: '2026-11-16',
    currency: 'INR',
    accent: '#f16a22',
    total: '55,50,000',
    items: [
      { heading: 'Ground Floor', price: '55,50,000', details: ['3000 SFT', '1850 per SFT'] },
      ...Array.from({ length: 28 }, (_, i) => ({
        heading: 'Material section ' + (i + 1),
        details: ['Client selected brand and grade', 'Specifications for the construction scope.'],
      })),
    ],
    terms: 'Agreement and advance|10.00\nRCC frame|60.00\nHandover|30.00',
    notes: 'This estimate is valid for the stated scope only.',
  });
  expect(Buffer.from(pdf).toString('ascii', 0, 5)).toBe('%PDF-');
  const doc = await PDFDocument.load(pdf);
  expect(doc.getPageCount()).toBeGreaterThan(1);
  expect(doc.getTitle()).toContain('Q-2026-000010');
  expect(doc.getAuthor()).toBe('SG Homes');
});
