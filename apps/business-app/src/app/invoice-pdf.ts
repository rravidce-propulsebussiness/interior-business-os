import 'server-only';
import { renderPdf } from '@business-os/shared/pdf';

export type InvoicePdfData={
 number:string|null;documentType:string;date:string;dueDate:string|null;
 partyName:string;partyAddress:string;partyGstin:string|null;
 lines:Array<{description:string;hsnSac:string;unit:string;quantity:number;
  unitPrice:number;discount:number;gstRate:number;taxable?:number;total?:number}>;
 subtotal:number;discount:number;taxable:number;cgst:number;sgst:number;igst:number;
 total:number;notes:string;snapshot:unknown;
};
const safe=(value:unknown)=>String(value??'').replace(/&/g,'&amp;')
 .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
 .replace(/'/g,'&#39;');
const currency=(n:number)=>Number(n||0).toLocaleString('en-IN',{
 minimumFractionDigits:2,maximumFractionDigits:2,
});
function field(obj:unknown,name:string){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))return '';
 return String((obj as Record<string,unknown>)[name]??'');
}
export async function invoicePdf(invoice:InvoicePdfData){
 if(!invoice.number)throw Error('Invoice must be issued before a PDF is shared');
 const kind=invoice.documentType==='tax_invoice'?'GST TAX INVOICE':
  invoice.documentType==='bill_of_supply'?'BILL OF SUPPLY':'COMMERCIAL INVOICE';
 const issuer=invoice.snapshot&&typeof invoice.snapshot==='object'?
  (invoice.snapshot as Record<string,unknown>).issuer:null;
 const name=field(issuer,'name');
 const address=field(issuer,'address');
 const gstin=field(issuer,'gstin');
 const tbody=invoice.lines.map(row=>'<tr><td>'+safe(row.description)+'</td><td>'+
  safe(row.hsnSac)+'</td><td>'+safe(row.quantity)+' '+safe(row.unit)+'</td><td>'+
  currency(row.unitPrice)+'</td><td>'+safe(row.gstRate)+'%</td><td>'+
  currency(row.total??(row.quantity*row.unitPrice-row.discount))+'</td></tr>').join('');
 const html=`<!doctype html><html><head><style>
 @page{size:A4;margin:15mm}*{box-sizing:border-box}
 body{font:12px Arial,sans-serif;color:#253146;margin:0;background:#fff}
 header{background:#fff4ed;border-left:5px solid #fb5a17;padding:18px;margin-bottom:22px}
 h1{font-size:21px;margin:0 0 8px}.meta{color:#607083;line-height:1.65}
 .parties{display:flex;justify-content:space-between;gap:25px;margin-bottom:25px}
 .parties>section{width:48%}h2{font-size:13px;margin-bottom:10px;color:#d95516}
 p{margin:4px 0;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin-top:20px}
 th{background:#f9efe8;text-align:left}td,th{padding:9px 6px;border-bottom:1px solid #e7e1dd;font-size:10px}
 .totals{margin:18px 0 0 auto;width:235px}.totals p{display:flex;justify-content:space-between;padding:6px}
 .total{font-size:16px;font-weight:bold;border-top:2px solid #ff692a}
 footer{margin-top:42px;color:#667186;border-top:1px solid #ddd;padding-top:12px}
 </style></head><body><header>
 <h1>${safe(kind)}</h1><div class="meta">Invoice: ${safe(invoice.number)}
 &nbsp;&nbsp; Date: ${safe(invoice.date)} &nbsp;&nbsp;
 Due: ${safe(invoice.dueDate??'As agreed')}</div></header>
 <div class="parties"><section><h2>ISSUED BY</h2><p><strong>${safe(name)}</strong></p>
 <p>${safe(address)}</p><p>GSTIN: ${safe(gstin||'Not registered')}</p></section>
 <section><h2>BILL TO</h2><p><strong>${safe(invoice.partyName)}</strong></p>
 <p>${safe(invoice.partyAddress)}</p><p>GSTIN: ${safe(invoice.partyGstin||'Unregistered')}</p>
 </section></div>
 <table><thead><tr><th>Description</th><th>HSN / SAC</th><th>Qty</th><th>Rate (INR)</th>
 <th>GST</th><th>Amount (INR)</th></tr></thead><tbody>${tbody}</tbody></table>
 <section class="totals"><p>Taxable value <b>${currency(invoice.taxable)}</b></p>
 ${invoice.cgst?'<p>CGST <b>'+currency(invoice.cgst)+'</b></p>':''}
 ${invoice.sgst?'<p>SGST <b>'+currency(invoice.sgst)+'</b></p>':''}
 ${invoice.igst?'<p>IGST <b>'+currency(invoice.igst)+'</b></p>':''}
 <p class="total">Total INR <b>${currency(invoice.total)}</b></p></section>
 ${invoice.notes?'<h2>NOTES</h2><p>'+safe(invoice.notes)+'</p>':''}
 <footer>Issued invoice / payment request. This document does not certify receipt of money.
 A payment receipt is provided after actual payment is recorded.</footer>
 </body></html>`;
 return renderPdf(html,{title:kind+' '+invoice.number,author:name});
}
