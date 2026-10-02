import { expect, it } from 'vitest';
import {
  operationsDocumentSchema,
  renderOperationsDocument,
} from './operations-document';
const fixture = {
  schema_version: 1,
  kind: 'handover',
  title: 'Handover Certificate',
  number: 'HO-2026-001',
  date: '2026-10-02',
  business: { name: 'Studio <North>' },
  project: { name: 'Residence' },
  columns: ['Item', 'Result'],
  rows: [['Keys', 'pass']],
  notes: 'Delivered <script>alert(1)</script>',
  internal_notes: 'SECRET',
  unit_cost: '999',
};
it('renders escaped allowlisted handover data without internal fields', () => {
  const html = renderOperationsDocument(fixture);
  expect(html).toContain('Studio &lt;North&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('SECRET');
  expect(html).not.toContain('999');
});
it('rejects mismatched report rows and excessive document payloads', () => {
  expect(
    operationsDocumentSchema.safeParse({ ...fixture, rows: [['One column']] })
      .success,
  ).toBe(false);
  expect(
    operationsDocumentSchema.safeParse({
      ...fixture,
      rows: Array.from({ length: 501 }, () => ['Item', 'pass']),
    }).success,
  ).toBe(false);
});
