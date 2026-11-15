import 'server-only';
import { renderPdf } from '@business-os/shared/pdf';
const field = (o: unknown, k: string): string =>
  o && typeof o === 'object' && !Array.isArray(o)
    ? String((o as Record<string, unknown>)[k] ?? '')
    : '';
const safe = (x: string) =>
  x
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
export async function paymentReceiptPdf(snapshot: unknown) {
  if (field(snapshot, 'kind') !== 'receipt' || !field(snapshot, 'number'))
    throw Error('Issued payment receipt required');
  const business =
    snapshot && typeof snapshot === 'object'
      ? (snapshot as Record<string, unknown>).business
      : null;
  const customer =
    snapshot && typeof snapshot === 'object'
      ? (snapshot as Record<string, unknown>).customer
      : null;
  const amount = Number(field(snapshot, 'total'));
  if (!Number.isFinite(amount) || amount <= 0) throw Error('Invalid amount');
  const html = `<!doctype html><html><head><style>
 @page{size:A4;margin:18mm}body{font:12px Arial,sans-serif;color:#253248}
 h1{font-size:21px;margin:0}header{background:#f0fff6;border-left:5px solid #16834a;padding:18px}
 h2{font-size:13px;color:#16653e}p{line-height:1.6;white-space:pre-wrap}
 section{margin:30px 0}.amount{font-size:25px;color:#16653e;font-weight:bold}
 footer{border-top:1px solid #ddd;color:#596579;margin-top:50px;padding-top:15px}
 </style></head><body><header><h1>Official Payment Receipt</h1>
 <p>Receipt ${safe(field(snapshot, 'number'))} · Date ${safe(field(snapshot, 'date'))}</p>
 </header><section><h2>Received by</h2><p>${safe(field(business, 'name'))}</p>
 <p>${safe(field(business, 'address'))}</p>
 <h2>Received from</h2><p>${safe(field(customer, 'name') || field(customer, 'customer_name'))}</p>
 <h2>Amount received</h2><p class="amount">INR ${amount.toLocaleString(
   'en-IN',
   {
     minimumFractionDigits: 2,
     maximumFractionDigits: 2,
   },
 )}</p>
 <p>Method: ${safe(field(snapshot, 'method'))}</p>
 <p>Bank / UPI reference: ${safe(field(snapshot, 'reference'))}</p>
 <p>Contract: ${safe(field(snapshot, 'contract_number'))}</p>
 </section><footer>Receipt confirms payment actually recorded by the business.
 This document is not a substitute for any legally required GST tax invoice.</footer>
 </body></html>`;
  return renderPdf(html, {
    title: 'Payment receipt ' + field(snapshot, 'number'),
    author: field(business, 'name'),
  });
}
