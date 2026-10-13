import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { appendQuotationAnnexures, validateQuotationAnnexure } from './pdf';

async function fixture(pages = 1) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    pdf.addPage([595, 842]);
  }
  return new Uint8Array(await pdf.save());
}

describe('company quotation PDF annexures', () => {
  it('appends PDF pages in order without changing the base quotation', async () => {
    const original = await fixture(1);
    const additional = await fixture(2);
    expect(await validateQuotationAnnexure(additional)).toBe(2);
    const result = await appendQuotationAnnexures(original, [additional]);
    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    expect((await PDFDocument.load(result)).getPageCount()).toBe(3);
  });

  it('rejects fake attachments and out-of-policy documents', async () => {
    await expect(
      validateQuotationAnnexure(new TextEncoder().encode('not a PDF')),
    ).rejects.toThrow();
    await expect(validateQuotationAnnexure(await fixture(61))).rejects.toThrow(
      'between 1 and 60',
    );
  });

  it('keeps the original bytes unchanged when no files are attached', async () => {
    const original = await fixture();
    const result = await appendQuotationAnnexures(original, []);
    expect(result.equals(Buffer.from(original))).toBe(true);
  });
});
