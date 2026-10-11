import { describe, expect, it } from 'vitest';
import type { GstFilingDocument } from '@business-os/database/gst-templates';
import { filingCsv } from './filing-csv';

const sample: GstFilingDocument = {
  number: 'INV-2627-00001',
  kind: 'sales_invoice',
  documentType: 'tax_invoice',
  date: '2026-10-11',
  placeOfSupply: '36',
  partyName: '=HYPERLINK("https://invalid.example","Bad")',
  partyGstin: '36ABCDE1234F1Z5',
  partyState: '36',
  supplierName: 'Local Constructions Pvt Ltd',
  supplierGstin: '36PQRST1234F1Z5',
  reverseCharge: false,
  taxable: 1000,
  cgst: 90,
  sgst: 90,
  igst: 0,
  discount: 0,
  total: 1180,
  lines: [{
    description: 'Service, "finishing"',
    hsnSac: '9954',
    unit: 'sqft',
    quantity: 2,
    unitPrice: 500,
    discount: 0,
    gstRate: 18,
    taxable: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    total: 1180,
  }],
};

describe('GST export working papers', () => {
  it('protects party inputs against Excel formula execution', () => {
    const csv = filingCsv([sample], 'summary');
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain('"1180"');
    expect(csv).toContain('Invoice Total');
  });
  it('escapes HSN line descriptions and includes reconciliable tax fields', () => {
    const csv = filingCsv([sample], 'items');
    expect(csv).toContain('"Service, ""finishing"""');
    expect(csv).toContain('"9954"');
    expect(csv).toContain('"90"');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
  it('keeps an empty report explicit with headers and no mock invoices', () => {
    const csv = filingCsv([], 'summary');
    expect(csv).toContain('Document No.');
    expect(csv).not.toContain('INV-');
  });
});
