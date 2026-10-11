import type { GstFilingDocument } from '@business-os/database/gst-templates';

export type WorkpaperFormat = 'summary' | 'items';

const summaryColumns = [
  'Document No.',
  'Date',
  'Document Type',
  'Our Business',
  'Our GSTIN',
  'Customer / Supplier',
  'Counterparty GSTIN',
  'Counterparty State',
  'Place of Supply',
  'Reverse Charge',
  'Taxable Value',
  'CGST',
  'SGST',
  'IGST',
  'Discount',
  'Invoice Total',
] as const;

const itemColumns = [
  'Document No.',
  'Date',
  'Document Type',
  'Counterparty',
  'Counterparty GSTIN',
  'HSN/SAC',
  'Description',
  'Unit',
  'Quantity',
  'Unit Rate',
  'Discount',
  'Taxable Value',
  'GST Rate',
  'CGST',
  'SGST',
  'IGST',
  'Line Total',
] as const;

function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // Prevent spreadsheet formula injection from customer/supplier entered fields.
  const escaped =
    typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(raw)
      ? "'" + raw
      : raw;
  return '"' + escaped.replace(/"/g, '""') + '"';
}

export function filingCsv(
  documents: GstFilingDocument[],
  format: WorkpaperFormat,
): string {
  const header = format === 'summary' ? summaryColumns : itemColumns;
  const rows: (string | number | boolean | null | undefined)[][] = [];
  for (const doc of documents) {
    if (format === 'summary') {
      rows.push([
        doc.number,
        doc.date,
        doc.documentType,
        doc.supplierName,
        doc.supplierGstin,
        doc.partyName,
        doc.partyGstin,
        doc.partyState,
        doc.placeOfSupply,
        doc.reverseCharge ? 'Yes' : 'No',
        doc.taxable,
        doc.cgst,
        doc.sgst,
        doc.igst,
        doc.discount,
        doc.total,
      ]);
    } else {
      for (const line of doc.lines) {
        rows.push([
          doc.number,
          doc.date,
          doc.documentType,
          doc.partyName,
          doc.partyGstin,
          line.hsnSac,
          line.description,
          line.unit,
          line.quantity,
          line.unitPrice,
          line.discount,
          line.taxable,
          line.gstRate,
          line.cgst,
          line.sgst,
          line.igst,
          line.total,
        ]);
      }
    }
  }
  return (
    '\uFEFF' +
    [
      header.map(cell).join(','),
      ...rows.map((row) => row.map(cell).join(',')),
    ].join('\r\n') +
    '\r\n'
  );
}
