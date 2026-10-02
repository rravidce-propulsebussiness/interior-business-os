import type { ExecutionDocument } from './execution-document';
export function executionDocumentFixture(
  kind: ExecutionDocument['kind'],
  count = 4,
): ExecutionDocument {
  const fixture: ExecutionDocument = {
    schema_version: 1,
    kind,
    number:
      kind === 'rfq'
        ? 'RFQ-2026-014'
        : kind === 'purchase_order'
          ? 'PO-2026-027'
          : kind === 'goods_receipt'
            ? 'GR-2026-009'
            : 'EST-2026-006',
    business: {
      name: 'Studio North Interiors',
      legal_name: 'Studio North Interiors',
      address: {
        line1: '28 Design Avenue',
        line2: '',
        city: 'Bengaluru',
        region: 'Karnataka',
        postal_code: '560001',
        country_code: 'IN',
      },
      phone: '+91 80000 12345',
      email: 'projects@example.test',
      tax_identifier: 'DEMO-TAX-ID',
    },
    project: { name: 'Maple Residence', code: 'MAPLE-26' },
    vendor: {
      name: 'Evergreen Materials',
      legal_name: 'Evergreen Materials',
      billing_address: {
        line1: '42 Industrial Estate',
        line2: 'Warehouse 2',
        city: 'Bengaluru',
        region: 'Karnataka',
        postal_code: '560058',
        country_code: 'IN',
      },
      phone: '+91 80000 54321',
      email: 'orders@example.test',
      tax_identifier: '',
    },
    revision: 2,
    status: 'approved',
    currency: 'INR',
    precision: 2,
    date: '2026-10-01',
    order_date: '2026-10-01',
    receipt_date: '2026-10-03',
    required_date: '2026-10-08',
    delivery_location:
      'Maple Residence, ground-floor receiving area. Call site contact before unloading.',
    po_number: 'PO-2026-027',
    contract_number: 'CT-2026-011',
    supplier_reference: 'Delivery note DN-083',
    quote_reference: 'SUP-2026-042',
    notes:
      'Verify grade, thickness and finish against the agreed specification. Keep damaged material separate and record the reason before acceptance.',
    payment_terms: 'Payment according to the approved supplier agreement.',
    scope: [
      {
        name: 'Wardrobe',
        area: 'Master bedroom',
        coverage: 'estimated',
        exclusion_reason: '',
        source_type: 'quotation',
      },
    ],
    items: Array.from({ length: count }, (_, i) => ({
      description: `${i + 1}. ${i % 2 ? 'Moisture-resistant back panel, 6 mm, approved finish' : 'BWP plywood, 18 mm, 8 × 4 ft sheet; carcass, shelves and vertical partitions'}`,
      unit: 'sheet',
      quantity: '3',
      ordered_quantity: '3',
      received_quantity: '3',
      accepted_quantity: '2',
      rejected_quantity: '1',
      base_quantity: '80',
      waste_quantity: '5.6',
      required_quantity: '85.6',
      calculated_purchase_quantity: '2.675',
      rounded_purchase_quantity: '3',
      consumption_unit: 'sqft',
      area: 'Master bedroom',
      scope: 'Wardrobe',
      cost_kind: 'material',
      unit_price: '100',
      discount: '0',
      taxable_amount: '300',
      tax_amount: '54',
      freight: '6',
      total: '360',
      notes:
        kind === 'goods_receipt'
          ? 'One panel rejected for edge damage. Supplier informed separately.'
          : 'Specified grade and finish; substitutions require approval.',
      accuracy: 'detailed',
    })),
    subtotal: String(count * 300),
    tax_amount: String(count * 54),
    freight: String(count * 6),
    total: String(count * 360),
  };
  if (kind !== 'execution_estimate') {
    delete fixture.revision;
    delete fixture.scope;
    delete fixture.contract_number;
    for (const item of fixture.items) {
      delete item.scope;
      delete item.area;
    }
  } else {
    delete fixture.vendor;
    delete fixture.delivery_location;
    delete fixture.required_date;
  }
  fixture.status =
    kind === 'execution_estimate'
      ? 'approved'
      : kind === 'goods_receipt'
        ? 'recorded'
        : 'issued';
  if (kind !== 'goods_receipt') {
    delete fixture.po_number;
    delete fixture.supplier_reference;
    delete fixture.receipt_date;
  }
  if (kind !== 'purchase_order') {
    delete fixture.quote_reference;
    delete fixture.payment_terms;
    delete fixture.order_date;
  }
  if (kind === 'execution_estimate') {
    fixture.total = String(count * 300);
    for (const item of fixture.items) item.total = '300';
  }
  if (kind === 'goods_receipt') fixture.date = '2026-10-03';
  return fixture;
}
