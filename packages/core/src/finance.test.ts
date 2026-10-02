import { describe, it, expect } from 'vitest';
import {
  financeCommandSchema,
  invoiceInputSchema,
  paymentInputSchema,
  scheduleInputSchema,
} from './finance';
import {
  financeDocumentSchema,
  renderFinanceDocument,
} from './finance-document';
import { financeDocumentFixture } from './finance-document.fixture';
describe('financial trust boundaries', () => {
  it('rejects browser-supplied contract values and invoice totals', () => {
    expect(() =>
      financeCommandSchema.parse({
        action: 'create_contract',
        revision_id: '11111111-1111-4111-8111-111111111111',
        original_contract_value: '1',
      }),
    ).toThrow();
    expect(() =>
      invoiceInputSchema.parse({
        invoice_type: 'tax_invoice',
        issue_date: '2026-09-29',
        due_date: null,
        tax_mode: 'exclusive',
        tax_application: 'line',
        tax_code_id: null,
        total: '1',
        items: [],
      }),
    ).toThrow();
  });
  it('keeps money as decimal text and rejects float/exponent inputs', () => {
    const item = {
      label: 'Booking',
      calculation_type: 'fixed',
      value: '100.01',
    };
    expect(
      scheduleInputSchema.parse({ label: 'Schedule', items: [item] }).items[0]
        ?.value,
    ).toBe('100.01');
    for (const value of [100.01, '1e4', 'NaN', 'Infinity', '-1', '0.0000001'])
      expect(() =>
        scheduleInputSchema.parse({
          label: 'Schedule',
          items: [{ ...item, value }],
        }),
      ).toThrow();
  });
  it('requires payment idempotency and explicit allocation identities', () => {
    expect(() =>
      paymentInputSchema.parse({
        payment_date: '2026-09-29',
        amount: '100',
        method_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toThrow();
  });
  it('rejects arbitrary schedule formulas', () => {
    expect(() =>
      scheduleInputSchema.parse({
        label: 'Schedule',
        items: [
          {
            label: 'Unsafe',
            calculation_type: 'formula',
            value: 'process.exit()',
          },
        ],
      }),
    ).toThrow();
  });
  for (const kind of [
    'tax_invoice',
    'proforma',
    'receipt',
    'change_order',
    'payment_request',
  ] as const)
    it(`renders ${kind} through a customer-only allowlist`, () => {
      const fixture = financeDocumentFixture(kind),
        raw = {
          ...fixture,
          internal_cost: 'SECRET-COST',
          staff_notes: 'SECRET-NOTES',
          audit_metadata: 'SECRET-AUDIT',
          lines: fixture.lines.map((line) => ({
            ...line,
            margin: 'SECRET-MARGIN',
          })),
        };
      const parsed = financeDocumentSchema.parse(raw),
        html = renderFinanceDocument(raw);
      expect(html).not.toMatch(
        /SECRET|internal_cost|staff_notes|audit_metadata/,
      );
      expect(parsed).not.toHaveProperty('internal_cost');
      expect(html).toContain('Studio North Interiors');
    });
  it('escapes customer-supplied HTML and retains long specifications', () => {
    const fixture = financeDocumentFixture();
    fixture.customer.name = '<script>alert(1)</script>';
    const html = renderFinanceDocument(fixture);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('END-OF-LONG-SCOPE');
  });
  it('renders historical input without current configuration', () => {
    const fixture = financeDocumentFixture(),
      before = renderFinanceDocument(fixture),
      changed = structuredClone(fixture);
    changed.business.payment_instructions = 'New bank';
    changed.tax = '20000';
    expect(renderFinanceDocument(fixture)).toBe(before);
    expect(renderFinanceDocument(changed)).not.toBe(before);
  });
});
