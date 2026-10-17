import { describe, expect, it } from 'vitest';
import { customBrandQuoteSchema, encodeCustomBrandQuote, parseCustomBrandQuote } from './custom-brand-quote';
import { quotationDocumentFixture } from './quotation-document.fixture';
import { renderQuotationDocument } from './quotation-document';

const selection = (id: string, category: string, name: string, unitPrice: string, ratePerSqft: string) => ({
  id, category, name, specification: 'Company-approved grade',
  unitPrice, priceUnit: 'kg', consumptionPerSqft: '3',
  ratePerSqft,
});
describe('versioned Custom Quote material snapshot', () => {
  const quote = {
    areaSqft: '3200', ratePerSqft: '420', total: '1344000',
    selections: [
      selection('123e4567-e89b-42d3-a456-426614174000','Steel','Tata TMT','80','240'),
      selection('123e4567-e89b-42d3-a456-426614174001','Labour','Labour','60','180'),
    ],
  };
  it('roundtrips brand, unit price, consumption and area for future quote revisions', () => {
    const encoded = encodeCustomBrandQuote(quote);
    expect(encoded).toContain('CUSTOM_BRAND_QUOTE_V1:');
    expect(parseCustomBrandQuote(encoded)).toEqual(quote);
  });
  it('prints selected unit prices and consumption in the premium PDF HTML without raw JSON', () => {
    const doc = quotationDocumentFixture();
    doc.lines = [{
      name: 'Custom Quote — selected materials and brands',
      description: encodeCustomBrandQuote(quote),
      area: '', optional: false, quantity: '3200',
      unit: 'built-up sq ft', rate: '420',
      amount: '1344000', discount: '0', specifications: [],
    }];
    doc.totals = {line_subtotal:'1344000',line_discount:'0',subtotal:'1344000',
      revision_discount:'0',final_amount:'1344000',optional_amount:'0'};
    const html = renderQuotationDocument(doc);
    expect(html).toContain('Custom brand-based construction estimate');
    expect(html).toContain('Tata TMT');
    expect(html).toContain('240');
    expect(html).toContain('3200 SFT');
    expect(html).not.toContain('CUSTOM_BRAND_QUOTE_V1:');
  });
  it('rejects stale malformed or unvalidated snapshots', () => {
    expect(parseCustomBrandQuote('invalid')).toBeNull();
    expect(parseCustomBrandQuote('CUSTOM_BRAND_QUOTE_V1:{"junk":true}')).toBeNull();
    expect(() => customBrandQuoteSchema.parse({...quote, selections: []})).toThrow();
  });
});
