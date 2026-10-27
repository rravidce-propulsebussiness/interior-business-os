import 'server-only';
import { renderPdf } from '@business-os/shared/pdf';

const get = (obj: unknown, key: string): unknown =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? (obj as Record<string, unknown>)[key]
    : null;
const value = (obj: unknown, key: string): string =>
  String(get(obj, key) ?? '');
const safe = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const money = (n: string) =>
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export async function stagePaymentRequestPdf(source: unknown) {
  const number = value(source, 'number');
  const total = value(source, 'total');
  const kind = value(source, 'kind');
  const lines = get(source, 'lines');
  if (
    kind !== 'payment_request' ||
    !/^PR[\w\-\/]*$/i.test(number) ||
    !Array.isArray(lines) ||
    lines.length !== 1 ||
    !Number.isFinite(Number(total)) ||
    Number(total) <= 0
  )
    throw Error('Issued payment request required');
  const item = lines[0];
  const business = get(source, 'business');
  const customer = get(source, 'customer');
  const project = get(source, 'project');
  const html = `<!doctype html><html><head><style>
 @page{size:A4;margin:16mm}*{box-sizing:border-box}
 body{font:12px Arial,sans-serif;color:#26364f}
 header{background:#fff2e9;border-left:5px solid #f25d26;padding:16px;margin-bottom:25px}
 h1{margin:0;font-size:21px}header p{margin:8px 0 0;color:#706a66}
 .columns{display:flex;gap:20px}.columns>div{width:50%}
 h2{font-size:12px;color:#c95a23;text-transform:uppercase;letter-spacing:1px}
 p{white-space:pre-wrap;line-height:1.5}
 table{width:100%;border-collapse:collapse;margin-top:25px}
 th{text-align:left;background:#fff2e9}td,th{padding:11px;border-bottom:1px solid #eee2da}
 .right{text-align:right}.total{font-size:19px;font-weight:bold;text-align:right;margin-top:22px}
 footer{border-top:1px solid #ddd;margin-top:55px;padding-top:14px;color:#777;font-size:11px}
 </style></head><body>
 <header><h1>Construction Stage Payment Request</h1>
 <p>Request ${safe(number)} · Date ${safe(value(source, 'date'))}
 · Due ${safe(value(source, 'due_date') || 'As agreed')}</p></header>
 <div class="columns"><div><h2>Issued by</h2>
 <p><b>${safe(value(business, 'name'))}</b></p>
 <p>${safe(value(business, 'address'))}</p>
 </div><div><h2>Customer & project</h2>
 <p>${safe(value(customer, 'name') || value(customer, 'customer_name'))}</p>
 <p>${safe(value(project, 'name') || value(project, 'project_name'))}</p>
 <p>Contract: ${safe(value(source, 'contract_number'))}</p></div></div>
 <table><thead><tr><th>Agreed quotation milestone</th>
 <th class="right">INR</th></tr></thead><tbody><tr>
 <td>${safe(value(item, 'description'))}</td>
 <td class="right">${money(total)}</td></tr></tbody></table>
 <div class="total">Amount requested: ₹${money(total)}</div>
 <h2>Payment instructions</h2><p>${safe(value(business, 'payment_instructions'))}</p>
 <footer>This is a payment request based on the signed quotation and certified
 construction work. Not a GST tax invoice and not a payment receipt.
 Money is recorded separately in Finance after it is received.</footer>
 </body></html>`;
  return renderPdf(html, {
    title: 'Stage payment request ' + number,
    author: value(business, 'name'),
  });
}
