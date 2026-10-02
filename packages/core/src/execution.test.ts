import { describe, expect, it } from 'vitest';
import {
  executionCommandSchema,
  executionModules,
  executionRuleSchema,
  executionFilterSchema,
  executionCommandPermission,
} from './execution';
import {
  executionDocumentSchema,
  renderExecutionDocument,
} from './execution-document';
import { executionDocumentFixture } from './execution-document.fixture';
describe('execution trust boundaries', () => {
  it('keeps execution independent of Billing and gates vendor purchases', () => {
    expect(executionModules('estimate.edit')).toEqual(['projects']);
    expect(executionModules('vendor_quote.manage')).toEqual([
      'projects',
      'vendors',
      'purchasing',
    ]);
    expect(executionModules('goods_receipt.record')).toEqual([
      'projects',
      'purchasing',
    ]);
  });
  it('rejects executable quantity formulas and floating-point values', () => {
    expect(
      executionRuleSchema.safeParse({ basis: 'eval', factor: '1' }).success,
    ).toBe(false);
    expect(
      executionRuleSchema.safeParse({ basis: 'fixed', factor: 0.1 }).success,
    ).toBe(false);
    expect(
      executionRuleSchema.safeParse({
        basis: 'fixed',
        factor: '1',
        code: 'process.env',
      }).success,
    ).toBe(false);
  });
  it('rejects unknown commands and tenant overrides', () => {
    expect(
      executionCommandSchema.safeParse({ action: 'raw_sql', input: {} })
        .success,
    ).toBe(false);
    expect(
      executionCommandSchema.safeParse({
        action: 'estimate',
        operation: 'approve',
        organization_id: 'forged',
        input: {},
      }).success,
    ).toBe(false);
  });
  it('rejects unsupported query fields and malformed identities', () => {
    expect(
      executionFilterSchema.safeParse({ project_id: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(executionFilterSchema.safeParse({ sql: 'select *' }).success).toBe(
      false,
    );
  });
  it.each([
    ['estimate', 'approve', 'estimate.approve'],
    ['estimate', 'revise', 'estimate.create'],
    ['estimate', 'return', 'estimate.review'],
    ['po_transition', 'issue', 'purchase_order.issue'],
    ['requisition_transition', 'approve', 'purchase_requisition.approve'],
  ] as const)(
    'maps %s %s to its write grant',
    (action, operation, permission) => {
      const c =
        action === 'estimate'
          ? { action, operation, input: {} }
          : {
              action,
              operation,
              id: '11111111-1111-4111-8111-111111111111',
              version: 1,
            };
      expect(executionCommandPermission(executionCommandSchema.parse(c))).toBe(
        permission,
      );
    },
  );
});
describe('execution document projections', () => {
  it.each([
    'rfq',
    'purchase_order',
    'goods_receipt',
    'execution_estimate',
  ] as const)('renders %s with safe business and item text', (kind) => {
    const d = executionDocumentFixture(kind);
    d.business.name = '<script>alert(1)</script>';
    const html = renderExecutionDocument(d);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain(d.number);
  });
  it('marks estimates internal and preserves override evidence', () => {
    const d = executionDocumentFixture('execution_estimate');
    d.items[0]!.override_quantity = '4';
    d.items[0]!.override_reason = 'Site allowance';
    const html = renderExecutionDocument(d);
    expect(html).toContain('Internal Execution Estimate');
    expect(html).toContain('Site allowance');
    expect(html).toContain('Calculated: 2.675');
  });
  it('omits internal rates and totals from RFQ and receipt output', () => {
    for (const kind of ['rfq', 'goods_receipt'] as const) {
      const d = executionDocumentFixture(kind);
      d.total = '987654321';
      d.items[0]!.unit_price = '123456789';
      const html = renderExecutionDocument(d);
      expect(html).not.toContain('987654321');
      expect(html).not.toContain('123456789');
    }
  });
  it('rejects remote and executable logo sources', () => {
    for (const logo of [
      'https://example.test/logo.png',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
    ]) {
      const d = executionDocumentFixture('rfq');
      d.business.logo_data_uri = logo;
      expect(executionDocumentSchema.safeParse(d).success).toBe(false);
    }
  });
  it('supports long item lists and repeated print headers', () => {
    const html = renderExecutionDocument(
      executionDocumentFixture('purchase_order', 90),
    );
    expect(html).toContain('90.');
    expect(html).toContain('table-header-group');
    expect(html).toContain('break-inside:avoid');
  });
  it('discards unknown internal fields before rendering', () => {
    const d = {
      ...executionDocumentFixture('rfq'),
      internal_margin: 'SECRET-MARGIN',
      audit_data: 'SECRET-AUDIT',
    };
    expect(renderExecutionDocument(d)).not.toMatch(
      /SECRET-MARGIN|SECRET-AUDIT/,
    );
  });
});
