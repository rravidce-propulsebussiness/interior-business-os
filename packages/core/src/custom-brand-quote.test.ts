import { describe, expect, it } from 'vitest';
import { customBrandQuoteSchema, encodeCustomBrandQuote, parseCustomBrandQuote } from './custom-brand-quote';

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
  it('rejects stale malformed or unvalidated snapshots', () => {
    expect(parseCustomBrandQuote('invalid')).toBeNull();
    expect(parseCustomBrandQuote('CUSTOM_BRAND_QUOTE_V1:{"junk":true}')).toBeNull();
    expect(() => customBrandQuoteSchema.parse({...quote, selections: []})).toThrow();
  });
});
