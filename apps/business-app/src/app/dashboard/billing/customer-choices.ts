import type { InvoiceStageChoice } from './stage-choices';

export type InvoiceCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  stateCode: string;
  fromApprovedQuotation: boolean;
  fromExistingCustomer: boolean;
  wonLeadId: string | null;
  leadNumber: string | null;
};
export type CustomerRow = {
  id: string;
  display_name: string;
  legal_name: string | null;
  phone: string | null;
  email: string | null;
  tax_identifier: string | null;
  billing_address: unknown;
  won_lead_id?: string | null;
  won_lead_number?: string | null;
  selection_source?: 'customer' | 'won_lead';
};

function cleanAddress(value: unknown): { text: string; state: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { text: '', state: '' };
  }
  const address = value as Record<string, unknown>;
  const get = (key: string) => typeof address[key] === 'string' ? String(address[key]).trim() : '';
  return {
    text: ['line1','line2','city','region','postal_code'].map(get).filter(Boolean).join(', '),
    state: get('state_code'),
  };
}

/** Never dedupe customers by name: customer IDs are authoritative. */
export function invoiceCustomerChoices(
  rows: CustomerRow[],
  stages: InvoiceStageChoice[],
  defaultStateCode: string,
): InvoiceCustomer[] {
  const clients = new Map<string, InvoiceCustomer>();
  for (const row of rows) {
    if (!row.id || !row.display_name?.trim()) continue;
    const address = cleanAddress(row.billing_address);
    const gstin = row.tax_identifier?.trim() ?? '';
    const state = gstin.match(/^[0-9]{2}/)?.[0] ?? address.state;
    clients.set(row.id, {
      id: row.id,
      name: row.legal_name?.trim() || row.display_name.trim(),
      phone: row.phone?.trim() ?? '',
      email: row.email?.trim() ?? '',
      gstin,
      address: address.text,
      stateCode: /^[0-9]{2}$/.test(state) ? state : defaultStateCode,
      fromApprovedQuotation: false,
      fromExistingCustomer: row.selection_source !== 'won_lead',
      wonLeadId: row.won_lead_id ?? null,
      leadNumber: row.won_lead_number ?? null,
    });
  }
  // A won lead's quotation can reference a provisional CRM customer which has
  // not yet appeared in the converted Clients directory.
  for (const stage of stages) {
    if (clients.has(stage.customerId) ||
        [...clients.values()].some(client=>client.wonLeadId===stage.leadId)) continue;
    clients.set(stage.customerId, {
      id: stage.customerId,
      name: stage.clientName,
      phone: '',
      email: '',
      gstin: stage.clientGstin,
      address: stage.clientAddress,
      stateCode: stage.clientState,
      fromApprovedQuotation: true,
      fromExistingCustomer: false,
      wonLeadId: null,
      leadNumber: null,
    });
  }
  return [...clients.values()].sort((a,b) => a.name.localeCompare(b.name));
}
