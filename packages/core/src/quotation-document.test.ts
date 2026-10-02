import { expect, it } from 'vitest';
import { renderQuotationDocument } from './quotation-document';
import { quotationDocumentFixture } from './quotation-document.fixture';
it('escapes customer text and excludes all unlisted/internal payload fields', () => {
  const d = quotationDocumentFixture();
  d.notes = '<script>alert("x")</script>';
  const html = renderQuotationDocument({
    ...d,
    internal_notes: 'INTERNAL_SECRET',
    estimatedCost: 'COST_SECRET',
    lines: d.lines.map((line) => ({
      ...line,
      minimum_rate: 'MINIMUM_SECRET',
      calculation: { modifiers: 'MODIFIER_SECRET' },
    })),
  });
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  for (const secret of [
    'INTERNAL_SECRET',
    'COST_SECRET',
    'MINIMUM_SECRET',
    'MODIFIER_SECRET',
  ])
    expect(html).not.toContain(secret);
});
it('rejects remote logos and CSS injection', () => {
  const d = quotationDocumentFixture();
  d.header.branding.logo_data_uri = 'https://example.test/logo.png';
  expect(() => renderQuotationDocument(d)).toThrow();
  d.header.branding.logo_data_uri = '';
  d.header.branding.accent = 'red; background:url(https://example.test)';
  expect(() => renderQuotationDocument(d)).toThrow();
});
it('honours visibility settings and is deterministic from saved snapshots', () => {
  const d = quotationDocumentFixture();
  d.header.display = {
    quantity: false,
    unit_rate: false,
    specifications: false,
  };
  const html = renderQuotationDocument(d);
  expect(html).not.toContain('<th>Quantity</th>');
  expect(html).not.toContain('Unit rate');
  expect(html).not.toContain('Hettich');
  expect(renderQuotationDocument(structuredClone(d))).toBe(html);
});
