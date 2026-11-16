import { describe, expect, it } from 'vitest';
import { invoiceCustomerChoices, type CustomerRow } from './customer-choices';

const ramya: CustomerRow = {
  id: 'customer-1',
  display_name: 'Ramya',
  legal_name: null,
  phone: '8978911262',
  email: '',
  tax_identifier: null,
  billing_address: null,
  won_lead_id: 'lead-1',
  won_lead_number: 'L-2026-000002',
  selection_source: 'customer',
};

describe('invoice customer identity', () => {
  it('uses one existing customer ID when the Won lead is the same person', () => {
    const result = invoiceCustomerChoices([ramya], [], '36');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'customer-1',
      name: 'Ramya',
      fromExistingCustomer: true,
      wonLeadId: 'lead-1',
      leadNumber: 'L-2026-000002',
    });
  });

  it('allows a new Won lead to be invoiced without fabricating a customer', () => {
    const result = invoiceCustomerChoices(
      [
        {
          ...ramya,
          id: 'lead-2',
          won_lead_id: 'lead-2',
          selection_source: 'won_lead',
        },
      ],
      [],
      '36',
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.fromExistingCustomer).toBe(false);
  });

  it('never merges two real customer records just because names match', () => {
    const result = invoiceCustomerChoices(
      [
        ramya,
        {
          ...ramya,
          id: 'customer-2',
          phone: '9000000000',
          won_lead_id: null,
          won_lead_number: null,
        },
      ],
      [],
      '36',
    );
    expect(result.map((c) => c.id)).toEqual(['customer-1', 'customer-2']);
  });
});
