import { emptyAddress } from './commercial';
import type { CustomerDocument } from './quotation-document';
export function quotationDocumentFixture(count = 1): CustomerDocument {
  const includedAmount = (
    BigInt(count > 1 ? count - 1 : count) * 133280n
  ).toString();
  return {
    number: 'Q-2026-000001',
    revision: 1,
    status: 'issued',
    currency: 'INR',
    valid_until: '2026-12-31',
    header: {
      branding: {
        name: 'Studio North Interiors',
        address: {
          ...emptyAddress,
          line1: '24 Design Avenue',
          city: 'Bengaluru',
          country_code: 'IN',
        },
        phone: '+91 80000 00000',
        email: 'studio@example.test',
        tax_identifier: 'DEMO-TAX',
        accent: '#245b55',
        logo_data_uri: '',
      },
      customer: {
        name: 'Ravi Residence',
        legal_name: '',
        phone: '',
        email: 'ravi@example.test',
        tax_identifier: '',
        billing_address: { ...emptyAddress, city: 'Bengaluru' },
      },
      project: {
        name: '3BHK Interior',
        code: '3BHK-DEMO',
        site_address: emptyAddress,
      },
      display: { quantity: true, unit_rate: true, specifications: true },
    },
    terms: Array.from(
      { length: 8 },
      (_, i) =>
        `${i + 1}. Finished work includes the specifications listed above. Changes require a revised quotation. Optional items are excluded from the payable total.`,
    ).join('\n\n'),
    notes: 'Thank you for considering our proposal.',
    lines: Array.from({ length: count }, (_, i) => ({
      name: `Wardrobe ${i + 1}`,
      description:
        'Custom finished wardrobe with configured hardware and external finish.',
      area: i % 2 ? 'Kitchen' : 'Master Bedroom',
      optional: i === count - 1 && count > 1,
      quantity: '56',
      unit: 'Square foot',
      rate: '2380',
      amount: '133280',
      discount: '0',
      specifications: [
        { label: 'Plywood grade', value: 'BWP' },
        { label: 'External finish', value: 'PU - Matte' },
        { label: 'Hardware', value: 'Hettich' },
      ],
    })),
    totals: {
      line_subtotal: includedAmount,
      line_discount: '0',
      subtotal: includedAmount,
      revision_discount: '0',
      final_amount: includedAmount,
      optional_amount: count > 1 ? '133280' : '0',
    },
  };
}
