import { z } from 'zod';
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const address = z.object({
  line1: z.string().default(''),
  line2: z.string().default(''),
  city: z.string().default(''),
  region: z.string().default(''),
  postal_code: z.string().default(''),
  country_code: z.string().default(''),
});
const taxComponent = z.object({
  name: z.string(),
  rate: decimal,
  amount: decimal.optional(),
});
export const financeDocumentSchema = z.object({
  schema_version: z.literal(1),
  kind: z.enum([
    'tax_invoice',
    'proforma',
    'receipt',
    'change_order',
    'payment_request',
  ]),
  number: z.string(),
  date: z.string(),
  due_date: z.string().nullable().optional(),
  status: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  contract_number: z.string(),
  business: z.object({
    name: z.string(),
    address: z.string(),
    tax_identifier: z.string(),
    payment_instructions: z.string(),
    receipt_footer: z.string(),
  }),
  customer: z.object({
    name: z.string(),
    legal_name: z.string().nullable().optional(),
    tax_identifier: z.string().nullable().optional(),
    billing_address: address,
  }),
  project: z.object({
    name: z.string(),
    code: z.string().nullable().optional(),
    site_address: address,
  }),
  notes: z.string(),
  terms: z.string(),
  subtotal: decimal.optional(),
  discount: decimal.optional(),
  taxable: decimal.optional(),
  tax: decimal.optional(),
  total: decimal,
  tax_mode: z.string().optional(),
  tax_application: z.string().optional(),
  tax_components: z.array(taxComponent).optional(),
  place_of_supply: z.string().optional(),
  billing_state: z.string().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  unallocated: decimal.optional(),
  previous_value: decimal.optional(),
  revised_value: decimal.optional(),
  lines: z
    .array(
      z.object({
        description: z.string(),
        quantity: decimal,
        unit: z.string(),
        rate: decimal,
        amount: decimal,
        discount: decimal.optional(),
        taxable: decimal.optional(),
        tax: decimal.optional(),
        tax_components: z.array(taxComponent).optional(),
        hsn_sac: z.string().optional(),
        change_type: z.string().optional(),
        reason: z.string().optional(),
        area: z.string().optional(),
        original_amount: decimal.optional(),
        new_amount: decimal.optional(),
        specifications: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .optional(),
      }),
    )
    .max(200),
});
export type FinanceDocument = z.infer<typeof financeDocumentSchema>;
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const names = {
  tax_invoice: 'Tax Invoice',
  proforma: 'Proforma Invoice',
  receipt: 'Payment Receipt',
  change_order: 'Change Order',
  payment_request: 'Payment Request',
};
export function renderFinanceDocument(input: unknown) {
  const d = financeDocumentSchema.parse(input),
    e = escape;
  const location = (a: z.infer<typeof address>) =>
    [a.line1, a.line2, a.city, a.region, a.postal_code, a.country_code]
      .filter(Boolean)
      .join(', ');
  const money = (value: string) => e(d.currency) + ' ' + e(value);
  const total = (label: string, value: string | undefined) =>
    value === undefined
      ? ''
      : `<div><span>${e(label)}</span><strong>${money(value)}</strong></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(names[d.kind])} ${e(d.number)}</title><style>
 @page{size:A4;margin:18mm 14mm 20mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#172f32;margin:0;background:#fff}main{max-width:900px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #174e47;padding-bottom:20px}h1{font-size:26px;margin:0}h2{font-size:15px;margin:0 0 6px}.muted{color:#546467}.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.reference{margin:12px 0}.status{text-transform:uppercase;font-weight:bold;letter-spacing:1px}.notice{padding:10px;background:#f1f5f4;border-left:3px solid #174e47;margin:12px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#edf3f2}th,td{text-align:left;padding:10px 7px;border-bottom:1px solid #d9e2e0;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:45%}.amount{text-align:right}.spec{font-size:10px;white-space:pre-wrap}.totals{margin:24px 0 24px auto;max-width:380px;break-inside:avoid}.totals div{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #e2e8e6}.terms{white-space:pre-wrap;margin-top:18px;overflow-wrap:anywhere}footer{margin-top:28px;border-top:1px solid #cad6d2;padding-top:12px;color:#546467}@media print{main{padding:0}header,.parties{break-inside:avoid}tr{break-inside:avoid}h2{break-after:avoid}}@media(max-width:600px){main{padding:12px}.parties{grid-template-columns:1fr}header{display:block}th,td{padding:6px 3px;font-size:10px}h1{font-size:22px}}
 </style></head><body><main><header><div><h1>${e(d.business.name)}</h1><p>${e(d.business.address)}</p>${d.business.tax_identifier ? `<p>Tax registration: ${e(d.business.tax_identifier)}</p>` : ''}</div><div><h2>${e(names[d.kind])}</h2><strong>${e(d.number)}</strong><p>Date: ${e(d.date)}${d.due_date ? `<br>Due: ${e(d.due_date)}` : ''}</p><p class="status">${e(d.status)}</p></div></header>
 ${d.kind === 'proforma' ? '<p class="notice">Proforma only. This is not a tax invoice or proof of payment.</p>' : d.kind === 'payment_request' ? '<p class="notice">Payment request only. This is not a tax invoice or receipt.</p>' : d.status === 'draft' ? '<p class="notice">Draft - not issued.</p>' : d.status === 'void' ? '<p class="notice">VOID - retained for historical reference.</p>' : ''}
 <section class="parties"><div><h2>${d.kind === 'receipt' ? 'Received from' : 'Bill to'}</h2><strong>${e(d.customer.name)}</strong><p>${e(location(d.customer.billing_address))}</p>${d.customer.tax_identifier ? `<p>Tax registration: ${e(d.customer.tax_identifier)}</p>` : ''}</div><div><h2>Project</h2><strong>${e(d.project.name)}</strong><p>${e(location(d.project.site_address))}</p><p>Contract: ${e(d.contract_number)}</p></div></section>
 ${d.place_of_supply || d.billing_state ? `<p>Billing state: ${e(d.billing_state ?? '')}  /  Place of supply: ${e(d.place_of_supply ?? '')}</p>` : ''}${d.method ? `<p>Payment method: ${e(d.method)}<br>Reference: ${e(d.reference ?? '')}</p>` : ''}
 <table><thead><tr><th>${d.kind === 'receipt' ? 'Allocated invoice' : 'Description'}</th><th>Quantity / unit</th><th class="amount">Rate</th><th class="amount">Amount (${e(d.currency)})</th></tr></thead><tbody>${d.lines.map((l) => `<tr><td><strong>${e(l.description)}</strong>${l.change_type ? `<div>${e(l.change_type)}${l.area ? '  /  ' + e(l.area) : ''}</div>` : ''}${l.reason ? `<div>${e(l.reason)}</div>` : ''}${l.original_amount !== undefined ? `<div>Original: ${money(l.original_amount)}<br>New: ${money(l.new_amount ?? '0')}</div>` : ''}${l.hsn_sac ? `<div>HSN/SAC: ${e(l.hsn_sac)}</div>` : ''}${(l.specifications ?? []).map((s) => `<div class="spec">${e(s.label)}: ${e(s.value)}</div>`).join('')}${(l.tax_components ?? []).map((t) => `<div class="spec">${e(t.name)} ${e(t.rate)}%: ${money(t.amount ?? '0')}</div>`).join('')}</td><td>${e(l.quantity)} ${e(l.unit)}</td><td class="amount">${e(l.rate)}</td><td class="amount">${e(l.amount)}</td></tr>`).join('')}</tbody></table>
 <section class="totals">${total('Subtotal', d.subtotal)}${total('Discount', d.discount)}${total('Taxable value', d.taxable)}${(
   d.tax_components ?? []
 )
   .filter((t) => t.amount !== undefined)
   .map((t) => total(t.name + ' ' + t.rate + '%', t.amount))
   .join(
     '',
   )}${total('Tax', d.tax)}${total('Previous contract', d.previous_value)}${total(d.kind === 'receipt' ? 'Amount received' : d.kind === 'change_order' ? 'Net adjustment' : 'Total', d.total)}${total('Revised contract if approved', d.revised_value)}${total('Unallocated at receipt issue', d.unallocated)}</section>
 ${d.notes ? `<section class="terms"><h2>Notes</h2>${e(d.notes)}</section>` : ''}${d.terms ? `<section class="terms"><h2>Terms</h2>${e(d.terms)}</section>` : ''}${d.kind !== 'receipt' && d.business.payment_instructions ? `<section class="terms"><h2>Payment instructions</h2>${e(d.business.payment_instructions)}</section>` : ''}<footer>${d.kind === 'receipt' ? e(d.business.receipt_footer) + '<p>Allocations shown as recorded at receipt issue. Later allocations appear on the account statement.</p>' : e(d.contract_number)}</footer></main></body></html>`;
}
