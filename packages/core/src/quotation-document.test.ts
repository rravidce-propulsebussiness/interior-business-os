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
  const pricing = html.indexOf('Detailed quotation');
  const specs = html.indexOf('Selected package inclusions');
  expect(client).toBeGreaterThan(0);
  expect(pricing).toBeGreaterThan(client);
  expect(specs).toBeGreaterThan(pricing);
  expect(html).toContain('Steel: Tata');
  expect(html).toContain('Bricks: Karimnagar');
  expect(html).toContain('1,33,280');
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
  expect(html).toContain('1,44,000');
  expect(html).toContain('Steel');
  expect(html).toContain('Tata');
  expect(html).not.toContain('SFT_ESTIMATE_V1:');
});

it('prints edited package specifications on a following page with escaped content', () => {
  const d = quotationDocumentFixture();
  d.lines[0]!.description = encodeSftEstimate(
    calculateSftEstimate(
      {
        rows: [
          {
            kind: 'floor',
            name: 'Ground Floor',
            lengthFeet: '20',
            widthFeet: '20',
            ratePerSqft: '1950',
          },
        ],
        materialIds: [],
        packageId: '22222222-2222-4222-8222-222222222222',
        sections: [
          {
            title: 'Footings and steel',
            description: 'Grade as specified, <script>alert(1)</script>',
          },
        ],
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
  expect(html).toContain('Selected package inclusions');
  expect(html).toContain('Ground Floor');
  expect(html).toContain('Footings and steel');
  expect(html).toContain('class="pb-package-specifications"');
  expect(html).toContain('break-before:page');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).not.toContain('SFT_ESTIMATE_V2:');
});

it('renders company theme and saved package brand, grade, allowance safely', () => {
  const d = quotationDocumentFixture();
  d.lines[0]!.description = encodeSftEstimate(
    calculateSftEstimate(
      {
        rows: [
          {
            name: 'Ground Floor',
            kind: 'floor',
            lengthFeet: '20',
            widthFeet: '30',
            ratePerSqft: '1950',
          },
        ],
        materialIds: [],
        sections: [
          {
            title: 'Tiles / flooring',
            brand: 'Kajaria',
            grade: 'Vitrified 2x2',
            allowancePerSqft: '85',
            description: '<script>unsafe</script> only floor materials',
          },
        ],
      },
      [],
      {
        name: 'Royal',
        code: 'ROYAL',
        description: 'Company-specific package',
        ratePerSqft: '1950',
        themeColor: '#089E9C',
      },
    ),
  );
  const html = renderQuotationDocument(d);
  expect(html).toContain('border-left:4px solid #245b55');
  expect(html).toContain('Kajaria');
  expect(html).toContain('Vitrified 2x2');
  expect(html).toContain('Material allowance:');
  expect(html).toContain('85');
  expect(html).not.toContain('<script>unsafe</script>');
  expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
});


it('shows editable proposed payment milestones in the customer PDF without leaking metadata', () => {
  const d = quotationDocumentFixture();
  d.totals.final_amount = '100000.00';
  d.terms = 'Workmanship warranty applies.\n\n[STAGE_PAYMENT_PLAN]\nAgreement & advance|10.00\nRCC frame|60.00\nHandover|30.00\n[/STAGE_PAYMENT_PLAN]';
  const html = renderQuotationDocument(d);
  expect(html).toContain('Proposed stage-wise payment schedule');
  expect(html).toContain('Agreement &amp; advance');
  expect(html).toContain('RCC frame');
  expect(html).toContain('10,000');
  expect(html).toContain('60,000');
  expect(html).toContain('30,000');
  expect(html).toContain('Workmanship warranty applies.');
  expect(html).not.toContain('[STAGE_PAYMENT_PLAN]');
  expect(html).not.toContain('[/STAGE_PAYMENT_PLAN]');
});


it('renders a branded brochure cover, readable pricing and closing page', () => {
  const d = quotationDocumentFixture();
  const html = renderQuotationDocument(d);
  expect(html).toContain('pb-cover');
  expect(html).toContain('pb-investment');
  expect(html).toContain('pb-end');
  expect(html).toContain('Prepared for Ravi Residence');
  expect(html).toContain('1,33,280');
  expect(html).toContain('Q-2026-000001');
  expect(html).toContain('break-after:page');
  expect(html).not.toContain('Building Better Tomorrows'); // not hardcoded SG Homes claims
  expect(renderQuotationDocument(structuredClone(d))).toBe(html);
});

it('embeds only saved company-owned photo data, never remote images or other company data', () => {
  const d = quotationDocumentFixture();
  d.header.branding.cover_image_data_uri = 'data:image/jpeg;base64,' + 'AA==';
  d.header.branding.detail_image_data_uri = 'data:image/png;base64,' + 'AA==';
  const html = renderQuotationDocument(d);
  expect(html).toContain('Company-provided project photograph');
  expect(html).toContain('Company-provided project photograph');
  expect(html).toContain('src="data:image/jpeg;base64,AA=="');
  expect(html).toContain('src="data:image/png;base64,AA=="');
  d.header.branding.cover_image_data_uri = 'https://example.test/photo.jpg';
  expect(() => renderQuotationDocument(d)).toThrow();
  d.header.branding.cover_image_data_uri = '';
  d.header.branding.detail_image_data_uri = '<script>alert(1)</script>';
  expect(() => renderQuotationDocument(d)).toThrow();
});

it('prints a 33-stage construction payment plan without amount or percentage drift', () => {
  const d = quotationDocumentFixture();
  d.totals.final_amount = '24035000.00';
  const amounts = Array.from({ length: 33 }, (_, i) =>
    'Stage ' + (i + 1) + '|' + (i === 32 ? '4.00' : '3.00'),
  );
  d.terms = '[STAGE_PAYMENT_PLAN]\n' + amounts.join('\n') + '\n[/STAGE_PAYMENT_PLAN]';
  const html = renderQuotationDocument(d);
  expect(html).toContain('Stage 33');
  expect(html).toContain('<td>100%</td>');
  expect(html).toContain('2,40,35,000');
  expect(html).not.toContain('[STAGE_PAYMENT_PLAN]');
});

it('shows distinct quotation page surfaces and factual saved specification cards', () => {
  const d = quotationDocumentFixture();
  const html = renderQuotationDocument(d);
  expect(html).toContain('pb-cover');
  expect(html).toContain('pb-page pb-pricing');
  expect(html).toContain('pb-page pb-specs-page');
  expect(html).toContain('pb-page pb-payment-page');
  expect(html).toContain('pb-end');
  expect(html).toContain('Detailed quotation');
  expect(html).toContain('Selected package inclusions');
  expect(html).toContain('Plywood grade');
  expect(html).toContain('Hettich');
  expect(html).toContain('Total quotation amount');
  expect(html).not.toContain('Kajaria / Somany');
  expect(html).not.toContain('TATA / Tiscon');
});

it('only inserts company-uploaded material photo in the same revision', () => {
  const d = quotationDocumentFixture();
  d.header.branding.materials_image_data_uri = 'data:image/jpeg;base64,AA==';
  const html = renderQuotationDocument(d);
  expect(html).toContain('Company-supplied materials photograph');
  expect(html).toContain('src="data:image/jpeg;base64,AA=="');
  d.header.branding.materials_image_data_uri = 'https://untrusted.example/photo.jpg';
  expect(() => renderQuotationDocument(d)).toThrow();
});


it('uses the work-wise SFT estimate without printing the same package twice', () => {
  const d = quotationDocumentFixture();
  d.lines[0]!.name = 'Luxury — floor-wise construction';
  d.lines[0]!.description = encodeSftEstimate(
    calculateSftEstimate({
      rows: [{name:'Ground Floor',kind:'floor',lengthFeet:'50',widthFeet:'60',ratePerSqft:'1850'}],
      materialIds: [],
    }, []),
  );
  d.lines[0]!.amount = '5550000';
  d.totals.final_amount = '5550000';
  d.totals.line_subtotal = '5550000';
  d.totals.subtotal = '5550000';
  const html = renderQuotationDocument(d);
  expect(html).toContain('Work-wise SFT estimate');
  expect(html).toContain('Ground Floor');
  expect(html).toContain('55,50,000');
  expect(html).not.toContain('Pricing summary');
  expect(html).not.toContain('<th class="line">Item / package</th>');
  // The package may still be named in its included material specifications.
  // It must not appear again as a separately billed pricing-table row.
  expect(html).toContain('Total proposed construction cost');
});

it('shows other separately quoted work and discounts without erasing payable amounts', () => {
  const d = quotationDocumentFixture();
  d.lines[0]!.description = encodeSftEstimate(
    calculateSftEstimate({
      rows: [{name:'Ground Floor',kind:'floor',lengthFeet:'20',widthFeet:'30',ratePerSqft:'1950'}],
      materialIds: [],
    }, []),
  );
  d.lines.push({
    ...d.lines[0]!,
    name:'Extra compound wall', description:'Independent additional item',
    quantity:'1',unit:'unit',rate:'80000',amount:'80000',
  });
  d.totals.revision_discount = '5000';
  d.totals.final_amount = '1245000';
  const html = renderQuotationDocument(d);
  expect(html).toContain('Additional quoted items');
  expect(html).toContain('Extra compound wall');
  expect(html).toContain('Quotation discount');
  expect(html).toContain('12,45,000');
  expect(html).toContain('Total proposed construction cost');
});

it('labels illustrative concept photographs instead of claiming company ownership', () => {
  const d = quotationDocumentFixture();
  const preview = renderQuotationDocument(d);
  expect(preview).toContain('Illustrative architectural concept');
  expect(preview).toContain('not an image of the proposed project');
  d.header.branding.cover_image_data_uri = 'data:image/jpeg;base64,AA==';
  const branded = renderQuotationDocument(d);
  expect(branded).not.toContain('not an image of the proposed project');
  expect(branded).toContain('Company-provided project photograph');
});

it('calls quotation value project cost and no longer claims three extra cover benefits', () => {
  const document = quotationDocumentFixture();
  const html = renderQuotationDocument(document);
  expect(html).toContain('Total project cost');
  expect(html).not.toContain('Proposed project investment');
  expect(html).not.toContain('class="pb-cover-steps"');
});

it('does not invent stage payments when the quotation has none saved', () => {
  const document = quotationDocumentFixture();
  document.terms = 'Materials as specified.';
  const html = renderQuotationDocument(document);
  expect(html).toContain('Payment schedule &amp; conditions');
  expect(html).toContain('Stage-wise payments not specified');
  expect(html).not.toContain('Agreement &amp; advance');
  expect(html).not.toContain('10.00%');
  expect(html).toContain('Materials as specified.');
});

it('keeps the saved payment table and exact final amount in the PDF', () => {
  const document = quotationDocumentFixture();
  document.totals.final_amount = '5550000.00';
  document.terms = '[STAGE_PAYMENT_PLAN]\nAdvance|10.00\nRCC & steel|40.00\nHandover|50.00\n[/STAGE_PAYMENT_PLAN]';
  const html = renderQuotationDocument(document);
  expect(html).toContain('Proposed stage-wise payment schedule');
  expect(html).toContain('RCC &amp; steel');
  expect(html).toContain('5,55,000');
  expect(html).toContain('22,20,000');
  expect(html).toContain('27,75,000');
  expect(html).toContain('55,50,000');
  expect(html).not.toContain('Stage-wise payments not specified');
  expect(html).not.toContain('[STAGE_PAYMENT_PLAN]');
});


it('prints saved Terms & Inclusions with distinct warranty and exclusions plus stage payment amounts', () => {
  const document=quotationDocumentFixture();
  document.totals.final_amount='5550000';
  document.terms=[
    'Inclusions:', 'Steel and cement as quoted', '',
    'Exclusions:', 'Borewell and owner-provided power', '',
    'Warranty:', 'Structural coverage for ten years', '',
    'Additional terms:', 'Subject to site accessibility', '',
    '[STAGE_PAYMENT_PLAN]', 'Advance|10.00', 'RCC & brickwork|60.00',
    'Handover|30.00', '[/STAGE_PAYMENT_PLAN]',
  ].join('\n');
  const html=renderQuotationDocument(document);
  expect(html).toContain('Terms &amp; Inclusions');
  expect(html).toContain('<h3>Inclusions</h3>');
  expect(html).toContain('Steel and cement as quoted');
  expect(html).toContain('<h3>Exclusions</h3>');
  expect(html).toContain('<h3>Warranty</h3>');
  expect(html).toContain('Structural coverage for ten years');
  expect(html).toContain('<h3>Additional terms</h3>');
  expect(html).toContain('Proposed stage-wise payment schedule');
  expect(html).toContain('RCC &amp; brickwork');
  expect(html).toContain('5,55,000');
  expect(html).toContain('33,30,000');
  expect(html).toContain('16,65,000');
  expect(html).not.toContain('[STAGE_PAYMENT_PLAN]');
});

it('safely prints legacy free-text terms without inventing milestone payments', () => {
  const document=quotationDocumentFixture();
  document.terms='Owner will arrange water and power; <script>unsafe()</script>';
  const html=renderQuotationDocument(document);
  expect(html).toContain('Terms &amp; Inclusions');
  expect(html).toContain('Additional terms');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>unsafe()</script>');
  expect(html).toContain('Stage-wise payments not specified');
  expect(html).not.toContain('Advance|10.00');
});
