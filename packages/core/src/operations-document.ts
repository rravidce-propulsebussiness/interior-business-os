import { z } from 'zod';
const text = z.string().max(10000);
export const operationsDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    kind: z.enum([
      'material_issue',
      'inventory_movement',
      'consumption',
      'movement_report',
      'inspection',
      'snag',
      'handover',
      'work_order',
      'completion',
    ]),
    title: text,
    number: text,
    date: text,
    business: z.object({
      name: text,
      legal_name: text.optional(),
      address: z
        .object({
          line1: text.optional(),
          line2: text.optional(),
          city: text.optional(),
          region: text.optional(),
          postal_code: text.optional(),
          country_code: text.optional(),
        })
        .optional(),
    }),
    project: z.object({ name: text, code: text.optional() }).nullish(),
    customer: text.nullish(),
    notes: text.default(''),
    acknowledgement: text.nullish(),
    prepared_by: text.nullish(),
    approved_by: text.nullish(),
    received_by: text.nullish(),
    result: text.nullish(),
    warranty_start: text.nullish(),
    warranty_end: text.nullish(),
    columns: z.array(text).min(1).max(12),
    rows: z.array(z.array(text.nullable()).max(12)).max(500),
  })
  .refine(
    (d) => d.rows.every((r) => r.length === d.columns.length),
    'Report columns must match rows',
  );
export type OperationsDocument = z.infer<typeof operationsDocumentSchema>;
const escape = (v: string) =>
  v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export function renderOperationsDocument(value: unknown) {
  const d = operationsDocumentSchema.parse(value),
    wide = d.columns.length > 7;
  const address = d.business.address
    ? Object.values(d.business.address).filter(Boolean).join(', ')
    : '';
  const facts = [
    ['Project', d.project?.name],
    ['Customer', d.customer],
    ['Prepared by', d.prepared_by],
    ['Approved by', d.approved_by],
    ['Received by', d.received_by],
    ['Result', d.result],
    ['Warranty start', d.warranty_start],
    ['Warranty end', d.warranty_end],
  ].filter(([, v]) => v);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(d.title)}</title><style>@page{size:A4 ${wide ? 'landscape' : 'portrait'};margin:15mm 13mm 18mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#17212b;line-height:1.5;margin:0}header{border-bottom:2px solid #203d4d;padding-bottom:14px;margin-bottom:16px}h1{font-size:21px;line-height:1.2;margin:0 0 5px}h2{font-size:15px;margin:14px 0 7px;break-after:avoid}p{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#546574}.identity{display:flex;justify-content:space-between;gap:20px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;margin:12px 0 18px}.facts strong{display:inline-block;min-width:85px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${wide ? '8' : '10'}px}thead{display:table-header-group}th{background:#e9eff2;text-align:left;font-weight:bold}th,td{padding:7px 6px;border-bottom:1px solid #d7e0e4;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}tr{break-inside:avoid}section{margin-top:15px}.sign{border-top:1px solid #d7e0e4;padding-top:8px;margin-top:20px}</style></head><body><header><div class="identity"><div><h1>${escape(d.business.legal_name || d.business.name)}</h1><p class="muted">${escape(address)}</p></div><div><strong>${escape(d.number)}</strong><p>${escape(d.date)}</p></div></div><h2>${escape(d.title)}</h2></header><div class="facts">${facts.map(([k, v]) => `<div><strong>${escape(k!)}:</strong> ${escape(v!)}</div>`).join('')}</div><table><thead><tr>${d.columns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${d.rows.map((row) => `<tr>${row.map((c) => `<td>${escape(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>${d.notes ? `<section><h2>Notes</h2><p>${escape(d.notes)}</p></section>` : ''}${d.acknowledgement ? `<section class="sign"><h2>Acknowledgement</h2><p>${escape(d.acknowledgement)}</p></section>` : ''}</body></html>`;
}
