import { expect, it } from 'vitest';
import { renderQuotationDocument } from './quotation-document';
import { quotationDocumentFixture } from './quotation-document.fixture';
import { calculateSftEstimate, encodeSftEstimate } from './sft-quotation';
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

it('renders client, pricing, then selected construction specifications without double billing', () => {
  const d = quotationDocumentFixture();
  d.lines[0]!.name = 'Premium — Construction package';
  d.lines[0]!.description =
    'Package: Premium (PREMIUM)\\nScope: Complete structure\\nMaterials / brands:\\nSteel: Tata\\nBricks: Karimnagar';
  const html = renderQuotationDocument(d);
  const client = html.indexOf('Prepared for');
  const pricing = html.indexOf('2 · Pricing');
  const specs = html.indexOf('3 · Materials &amp; brand specifications');
  expect(client).toBeGreaterThan(0);
  expect(pricing).toBeGreaterThan(client);
  expect(specs).toBeGreaterThan(pricing);
  expect(html).toContain('Steel: Tata');
  expect(html).toContain('Bricks: Karimnagar');
  expect(html).toContain('133280');
});

it('prints floor-wise SFT pricing table and separate included brands without exposing snapshot encoding', () => {
  const d = quotationDocumentFixture();
  d.lines[0]!.description = encodeSftEstimate(
    calculateSftEstimate(
      {
        rows: [
          {
            name: 'Parking Area',
            lengthFeet: '20',
            widthFeet: '8',
            ratePerSqft: '900',
          },
          {
            name: 'Ground floor commercial',
            lengthFeet: '20',
            widthFeet: '72',
            ratePerSqft: '1380',
          },
        ],
        materialIds: ['11111111-1111-4111-8111-111111111111'],
      },
      [{ category: 'Steel', name: 'Tata', specification: 'Fe 500D' }],
    ),
  );
  const html = renderQuotationDocument(d);
  expect(html).toContain('Work-wise SFT estimate');
  expect(html).toContain('Parking Area');
  expect(html).toContain('Ground floor commercial');
  expect(html).toContain('160.00');
  expect(html).toContain('144000.00');
  expect(html).toContain('Steel');
  expect(html).toContain('Tata');
  expect(html).not.toContain('SFT_ESTIMATE_V1:');
});


it('prints edited package specifications on a following page with escaped content', () => {
  const d = quotationDocumentFixture();
  d.lines[0]!.description = encodeSftEstimate(
    calculateSftEstimate(
      {
        rows: [{
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '20',
          widthFeet: '20',
          ratePerSqft: '1950',
        }],
        materialIds: [],
        packageId: '22222222-2222-4222-8222-222222222222',
        sections: [{
          title: 'Footings and steel',
          description: 'Grade as specified, <script>alert(1)</script>',
        }],
      },
      [],
      {
        name: 'Royal',
        code: 'ROYAL',
        description: 'Construction',
        ratePerSqft: '1950',
      },
    ),
  );
  const html = renderQuotationDocument(d);
  expect(html).toContain('02 / PACKAGE SPECIFICATIONS');
  expect(html).toContain('Ground Floor');
  expect(html).toContain('Footings and steel');
  expect(html).toContain('section class="spec-pages"');
  expect(html).toContain('break-before:page');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).not.toContain('SFT_ESTIMATE_V2:');
});
