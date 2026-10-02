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
const optionalDecimal = decimal.nullish();
const item = z.object({
  description: z.string(),
  unit: z.string(),
  quantity: optionalDecimal,
  ordered_quantity: optionalDecimal,
  received_quantity: optionalDecimal,
  accepted_quantity: optionalDecimal,
  rejected_quantity: optionalDecimal,
  base_quantity: optionalDecimal,
  waste_quantity: optionalDecimal,
  required_quantity: optionalDecimal,
  calculated_purchase_quantity: optionalDecimal,
  rounded_purchase_quantity: optionalDecimal,
  override_quantity: optionalDecimal,
  override_reason: z.string().optional(),
  consumption_unit: z.string().optional(),
  area: z.string().optional(),
  scope: z.string().optional(),
  cost_kind: z.string().optional(),
  unit_price: optionalDecimal,
  discount: optionalDecimal,
  taxable_amount: optionalDecimal,
  tax_amount: optionalDecimal,
  freight: optionalDecimal,
  total: optionalDecimal,
  notes: z.string().optional(),
  accuracy: z.string().optional(),
});
export const executionDocumentSchema = z.object({
  schema_version: z.literal(1),
  kind: z.enum([
    'rfq',
    'purchase_order',
    'goods_receipt',
    'execution_estimate',
  ]),
  number: z.string().min(1),
  business: z.object({
    name: z.string(),
    legal_name: z.string().default(''),
    address: address.default({
      line1: '',
      line2: '',
      city: '',
      region: '',
      postal_code: '',
      country_code: '',
    }),
    phone: z.string().default(''),
    email: z.string().default(''),
    tax_identifier: z.string().default(''),
    logo_data_uri: z
      .string()
      .max(180000)
      .regex(/^$|^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
      .nullish(),
  }),
  project: z
    .object({ name: z.string(), code: z.string().default('') })
    .optional(),
  vendor: z
    .object({
      name: z.string(),
      legal_name: z.string().default(''),
      billing_address: address.optional(),
      phone: z.string().default(''),
      email: z.string().default(''),
      tax_identifier: z.string().default(''),
    })
    .optional(),
  revision: z.number().int().positive().optional(),
  status: z.string().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  precision: z.number().int().min(0).max(6).optional(),
  date: z.string().optional(),
  issued_at: z.string().optional(),
  order_date: z.string().optional(),
  receipt_date: z.string().optional(),
  required_date: z.string().nullish(),
  delivery_date: z.string().nullish(),
  delivery_location: z.string().optional(),
  po_number: z.string().optional(),
  contract_number: z.string().optional(),
  supplier_reference: z.string().optional(),
  quote_reference: z.string().optional(),
  notes: z.string().default(''),
  payment_terms: z.string().optional(),
  items: z.array(item).max(1000),
  scope: z
    .array(
      z.object({
        name: z.string().nullish(),
        area: z.string(),
        coverage: z.string(),
        exclusion_reason: z.string(),
        source_type: z.string(),
      }),
    )
    .optional(),
  subtotal: optionalDecimal,
  tax_amount: optionalDecimal,
  freight: optionalDecimal,
  total: optionalDecimal,
});
export type ExecutionDocument = z.infer<typeof executionDocumentSchema>;
const escape = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const formatAddress = (a: z.infer<typeof address> | undefined) =>
  a ? Object.values(a).filter(Boolean).map(escape).join(', ') : '';
export function renderExecutionDocument(input: unknown): string {
  const d = executionDocumentSchema.parse(input),
    priced = d.kind === 'purchase_order' || d.kind === 'execution_estimate';
  const title = {
    rfq: 'Request for Quotation',
    purchase_order: 'Purchase Order',
    goods_receipt: 'Goods / Service Receipt',
    execution_estimate: 'Internal Execution Estimate',
  }[d.kind];
  const money = (v: string | null | undefined) =>
    v === null || v === undefined
      ? 'Not costed'
      : `${escape(d.currency ?? '')} ${escape(v)}`;
  const columns =
    d.kind === 'goods_receipt'
      ? ['Item', 'Ordered', 'Received', 'Accepted', 'Rejected']
      : d.kind === 'execution_estimate'
        ? [
            'Scope / requirement',
            'Base / waste',
            'Calculated / planned',
            'Estimated cost',
          ]
        : d.kind === 'purchase_order'
          ? ['Item', 'Quantity', 'Rate / discount', 'Tax', 'Amount']
          : ['Required item', 'Quantity', 'Unit'];
  const rows = d.items
    .map((line) => {
      const description = `<strong>${escape(line.description)}</strong>${line.scope ? `<p>${escape(line.area || 'General')} / ${escape(line.scope)}</p>` : ''}${line.notes ? `<p class="note">${escape(line.notes)}</p>` : ''}`;
      if (d.kind === 'goods_receipt')
        return `<tr><td>${description}<p>${escape(line.unit)}</p></td><td>${escape(line.ordered_quantity)}</td><td>${escape(line.received_quantity)}</td><td>${escape(line.accepted_quantity)}</td><td>${escape(line.rejected_quantity)}</td></tr>`;
      if (d.kind === 'execution_estimate')
        return `<tr><td>${description}<p>${escape(line.cost_kind)} · ${escape(line.accuracy)}</p></td><td>${escape(line.base_quantity)} ${escape(line.consumption_unit)}<p>Waste: ${escape(line.waste_quantity)}</p></td><td>Calculated: ${escape(line.calculated_purchase_quantity)}<p>Rounded: ${escape(line.rounded_purchase_quantity)}</p><strong>Planned: ${escape(line.quantity)} ${escape(line.unit)}</strong>${line.override_quantity ? `<p>Override: ${escape(line.override_quantity)}<br>${escape(line.override_reason)}</p>` : ''}</td><td class="amount">${money(line.total)}<p>Rate: ${money(line.unit_price)}</p></td></tr>`;
      if (d.kind === 'purchase_order')
        return `<tr><td>${description}</td><td>${escape(line.quantity)} ${escape(line.unit)}</td><td class="amount">${money(line.unit_price)}<p>Discount: ${money(line.discount)}</p></td><td class="amount">${money(line.tax_amount)}</td><td class="amount">${money(line.total)}<p>Freight: ${money(line.freight)}</p></td></tr>`;
      return `<tr><td>${description}</td><td>${escape(line.quantity)}</td><td>${escape(line.unit)}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)} ${escape(d.number)}</title><style>
  @page{size:A4;margin:16mm 13mm 18mm}*{box-sizing:border-box}body{font:11px/1.45 Arial,sans-serif;color:#172536;margin:0}header{border-bottom:3px solid #245d62;padding-bottom:12px;margin-bottom:16px}header img{max-width:130px;max-height:52px;float:right}h1{font-size:23px;line-height:1.2;margin:8px 0}h2{break-after:avoid;font-size:15px;margin:16px 0 6px}h3{font-size:12px;margin:4px 0}p{margin:3px 0}table{border-collapse:collapse;width:100%;margin-top:15px;table-layout:fixed}thead{display:table-header-group}th{background:#e8f0f0;text-align:left;font-size:10px}th,td{padding:8px 6px;border-bottom:1px solid #ccd7db;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:${d.kind === 'rfq' ? '65%' : '38%'}}tr{break-inside:avoid}.amount{text-align:right}.parties{display:flex;gap:24px}.parties section{flex:1}.meta{color:#4a5b65}.note{white-space:pre-wrap;overflow-wrap:anywhere}.totals{margin-left:auto;width:52%;break-inside:avoid}.totals td{padding:6px}.total{font-size:14px;font-weight:bold;background:#e8f0f0}.internal{padding:8px;background:#fff1d6;border-left:3px solid #946420}.scope-list{font-size:10px}.terms{break-inside:avoid;margin-top:16px;white-space:pre-wrap;overflow-wrap:anywhere}
  </style></head><body><header>${d.business.logo_data_uri ? `<img alt="Business logo" src="${escape(d.business.logo_data_uri)}">` : ''}<h2>${escape(d.business.name)}</h2><p>${formatAddress(d.business.address)}</p><p>${escape(d.business.phone)} ${escape(d.business.email)}</p>${d.business.tax_identifier ? `<p>Tax ID: ${escape(d.business.tax_identifier)}</p>` : ''}</header><h1>${escape(title)}</h1><p class="meta">${escape(d.number)}${d.revision ? ` · Revision ${d.revision}` : ''} · ${escape(d.date || d.order_date || d.receipt_date || d.issued_at?.slice(0, 10))}${d.status ? ` · ${escape(d.status.toUpperCase())}` : ''}</p>
  ${d.kind === 'execution_estimate' ? '<p class="internal">INTERNAL — Planning estimate, not measured material consumption or final profit.</p>' : ''}<div class="parties">${d.vendor ? `<section><h2>Vendor</h2><h3>${escape(d.vendor.name)}</h3><p>${formatAddress(d.vendor.billing_address)}</p><p>${escape(d.vendor.phone)} ${escape(d.vendor.email)}</p>${d.quote_reference ? `<p>Quote: ${escape(d.quote_reference)}</p>` : ''}</section>` : ''}<section>${d.project ? `<h2>Project</h2><h3>${escape(d.project.name)}</h3><p>${escape(d.project.code)}</p>` : ''}${d.contract_number ? `<p>Contract: ${escape(d.contract_number)}</p>` : ''}${d.po_number ? `<p>PO: ${escape(d.po_number)}</p>` : ''}${d.required_date || d.delivery_date ? `<p>Required delivery: ${escape(d.required_date || d.delivery_date)}</p>` : ''}${d.delivery_location ? `<p>${escape(d.delivery_location)}</p>` : ''}${d.supplier_reference ? `<p>Supplier reference: ${escape(d.supplier_reference)}</p>` : ''}</section></div>
  ${d.kind === 'execution_estimate' && d.scope?.length ? `<section class="scope-list"><h2>Scope coverage</h2>${d.scope.map((s) => `<p>${escape(s.area || 'General')} · ${escape(s.name)} · ${escape(s.coverage)}${s.exclusion_reason ? ` — ${escape(s.exclusion_reason)}` : ''}</p>`).join('')}</section>` : ''}<table><thead><tr>${columns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  ${priced ? `<table class="totals"><tbody>${d.kind === 'purchase_order' ? `<tr><td>Subtotal</td><td class="amount">${money(d.subtotal)}</td></tr><tr><td>Tax</td><td class="amount">${money(d.tax_amount)}</td></tr><tr><td>Freight</td><td class="amount">${money(d.freight)}</td></tr>` : ''}<tr class="total"><td>${d.kind === 'execution_estimate' ? 'Estimated cost' : 'Order total'}</td><td class="amount">${money(d.total)}</td></tr></tbody></table>` : ''}${d.notes ? `<section class="terms"><h2>Notes</h2>${escape(d.notes)}</section>` : ''}${d.kind === 'purchase_order' && d.payment_terms ? `<section class="terms"><h2>Payment terms</h2>${escape(d.payment_terms)}</section>` : ''}${d.kind === 'goods_receipt' ? '<p class="terms">Received quantities include accepted and rejected quantities. This receipt does not create an inventory ledger or recognize accounting expense.</p>' : ''}</body></html>`;
}
