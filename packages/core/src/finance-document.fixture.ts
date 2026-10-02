import type { FinanceDocument } from './finance-document';
export function financeDocumentFixture(
  kind: FinanceDocument['kind'] = 'tax_invoice',
  count = 3,
): FinanceDocument {
  const subtotal = BigInt(count) * 1000n;
  const component = (subtotal * 9n) / 100n;
  const address = {
    line1: '24 Garden Road',
    line2: '',
    city: 'Bengaluru',
    region: 'Karnataka',
    postal_code: '560001',
    country_code: 'IN',
  };
  return {
    schema_version: 1,
    kind,
    number:
      kind === 'receipt'
        ? 'RCPT-2026-000001'
        : kind === 'change_order'
          ? 'CO-2026-000001'
          : 'INV-2026-000001',
    date: '2026-09-29',
    due_date:
      kind === 'receipt' || kind === 'change_order' ? null : '2026-10-15',
    status: kind === 'change_order' ? 'approved' : 'issued',
    currency: 'INR',
    contract_number: 'CT-2026-000001',
    business: {
      name: 'Studio North Interiors',
      address: '18 Design Avenue, Bengaluru, Karnataka 560001',
      tax_identifier: 'Demo registration',
      payment_instructions:
        'Bank transfer using the document number as reference.',
      receipt_footer: 'Payment acknowledged by Studio North Interiors.',
    },
    customer: {
      name: 'Rahul and Meera Residence',
      tax_identifier: '',
      billing_address: address,
    },
    project: { name: 'Garden Residence', code: 'GR-01', site_address: address },
    notes: 'Please quote the document number in correspondence.',
    terms:
      'Payment according to the agreed scope and milestones. All amounts are in INR.',
    subtotal: subtotal.toString(),
    discount: '0',
    taxable: subtotal.toString(),
    tax: (component * 2n).toString(),
    total: (subtotal + component * 2n).toString(),
    tax_mode: 'exclusive',
    tax_application: 'document',
    tax_components: [
      { name: 'CGST', rate: '9', amount: component.toString() },
      { name: 'SGST', rate: '9', amount: component.toString() },
    ],
    billing_state: 'Karnataka',
    place_of_supply: 'Karnataka',
    ...(kind === 'receipt'
      ? {
          method: 'Bank transfer',
          reference: 'TRANSFER-DEMO',
          unallocated: '2000',
          total: (subtotal + 2000n).toString(),
          subtotal: undefined,
          discount: undefined,
          taxable: undefined,
          tax: undefined,
          tax_components: undefined,
        }
      : {}),
    ...(kind === 'change_order'
      ? {
          previous_value: '1250000',
          revised_value: (1250000n + BigInt(count) * 30000n).toString(),
          total: (BigInt(count) * 30000n).toString(),
          subtotal: undefined,
          taxable: undefined,
          tax: undefined,
          tax_components: undefined,
        }
      : {}),
    ...(kind === 'payment_request'
      ? {
          subtotal: undefined,
          discount: undefined,
          taxable: undefined,
          tax: undefined,
          tax_components: undefined,
          total: subtotal.toString(),
        }
      : {}),
    ...(['receipt', 'change_order', 'payment_request'].includes(kind)
      ? { billing_state: undefined, place_of_supply: undefined }
      : {}),
    lines: Array.from({ length: count }, (_, i) => ({
      description:
        kind === 'receipt'
          ? `Invoice allocation ${i + 1}`
          : `Wardrobe scope ${i + 1}`,
      quantity: '1',
      unit: 'each',
      rate: kind === 'change_order' ? '170000' : '1000',
      amount: kind === 'change_order' ? '30000' : '1000',
      hsn_sac: kind === 'receipt' ? '' : 'Demo SAC',
      specifications:
        kind === 'receipt'
          ? []
          : [
              {
                label: 'Finish',
                value:
                  'PU matte finish with concealed hardware and adjustable shelves.',
              },
              {
                label: 'Scope',
                value:
                  i === 0
                    ? 'A detailed customer-visible specification. '.repeat(12) +
                      'END-OF-LONG-SCOPE'
                    : 'As approved in the quotation.',
              },
            ],
      ...(kind === 'change_order'
        ? {
            change_type: 'modification',
            reason: 'Customer requested a finish upgrade',
            area: 'Master bedroom',
            original_amount: '140000',
            new_amount: '170000',
          }
        : {}),
    })),
  };
}
