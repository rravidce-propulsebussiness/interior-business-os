import { catalogPage } from '../../../catalog/access';
import { pageServices } from '@business-os/auth/server';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import {
  renderConstructionPackageSamplePdf,
  renderPdf,
} from '@business-os/shared/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const escape = (value:string) => value.replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');
const cash = (n:number) => new Intl.NumberFormat('en-IN',{
  style:'currency',currency:'INR',maximumFractionDigits:2,
}).format(n);

/** Authenticated company-only sample (never a customer quotation).
 * Always prints persisted default brands, not unsaved browser edits.
 */
export async function GET() {
  try {
    const { org } = await catalogPage(true);
    const { client, repository } = await pageServices();
    const [company, rates] = await Promise.all([
      repository.organization(org),
      createConstructionRatesRepository(client).list(org),
    ]);
    if (!company) return new Response('Company not found', {status:404});
    const categories = [...new Set(rates.filter(r=>r.status==='active')
      .map(r=>r.category))];
    const chosen = categories.flatMap(category => {
      const entries=rates.filter(r=>r.status==='active'&&r.category===category);
      const rate=entries.find(r=>r.isDefault)??entries[0];
      return rate?[rate]:[];
    });
    if (!chosen.length) return new Response('Add company material prices before previewing.',{
      status:422,headers:{'Content-Type':'text/plain; charset=utf-8'},
    });
    const total=chosen.reduce((sum,rate)=>sum+Number(rate.ratePerSqft),0);
    const rows=chosen.map(rate=>
      '<tr><td><strong>'+escape(rate.category)+'</strong><small>'+escape(rate.name)+
      '</small></td><td>'+escape(rate.consumptionPerSqft)+' '+escape(rate.priceUnit)+
      '</td><td class="money">'+escape(cash(Number(rate.unitPrice)))+
      ' / '+escape(rate.priceUnit)+'</td><td class="money"><strong>'+
      escape(cash(Number(rate.ratePerSqft)))+'</strong></td></tr>',
    ).join('');
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
      '<title>Custom Package Rate Preview</title><style>'+
      '@page{size:A4;margin:16mm}*{box-sizing:border-box}'+
      'body{margin:0;font:13px/1.55 Arial,sans-serif;background:white;color:#172b45}'+
      'header{background:#172b45;color:white;padding:27px 30px;border-top:8px solid #f97316}'+
      'header strong{font-size:18px}main{padding:24px 30px}'+
      'h1{font-size:29px;letter-spacing:-.04em;margin:8px 0}'+
      '.label{color:#f97316;font-size:10px;font-weight:bold;letter-spacing:.16em}'+
      '.muted{color:#6d7e94}table{width:100%;border-collapse:collapse;margin-top:26px}'+
      'th{background:#edf2f7;color:#43566e;text-align:left;font-size:11px}'+
      'td,th{padding:14px 10px;border-bottom:1px solid #e6edf2}'+
      'td small{display:block;color:#738296;margin-top:4px}'+
      '.money{text-align:right;white-space:nowrap}.money strong{color:#eb651e}'+
      '.total{margin-top:22px;padding:20px;background:#fff0e5;border-left:5px solid #ef671a}'+
      '.total strong{display:block;font-size:31px;color:#ec621a}'+
      'footer{border-top:1px solid #e3e8ef;margin:32px 30px 0;padding-top:12px;font-size:11px;color:#7b8795}'+
      '</style></head><body><header><strong>'+escape(company.name)+
      '</strong><p>Company pricing · Custom Package</p></header><main>'+
      '<span class="label">MATERIALS / BRAND PRICING</span><h1>Custom Package Management</h1>'+
      '<p class="muted">Company-selected default brands and material consumption per built-up SFT.'+
      ' This is a pricing preview, not a client quotation or fixed-price promise.</p>'+
      '<table><thead><tr><th>Material / brand</th><th>Usage per SFT</th>'+
      '<th class="money">Unit price</th><th class="money">Cost per SFT</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="total"><span>Calculated construction materials rate</span>'+
      '<strong>'+escape(cash(total))+' per SFT</strong></div>'+
      '<p class="muted">Only configured categories are included. Add labour, overhead,'+
      ' applicable taxes, allowances and other costs as separate priced categories before quoting.</p>'+
      '</main><footer>Business OS · Generated from saved company pricing</footer></body></html>';
    let pdf:Uint8Array;
    try {
      pdf=await renderPdf(html,{
        brochure:true,title:'Custom Package Rate Preview',author:company.name,
      });
    } catch {
      // Preserve a real downloadable PDF when Chromium is unavailable.
      pdf=await renderConstructionPackageSamplePdf({
        company:company.name,name:'Custom Package Management',
        code:'CUSTOM',description:'Company-owned default material and brand rates',
        ratePerSqft:total.toFixed(2),themeColor:'#F97316',
        sections:chosen.map(rate=>({
          title:rate.category,brand:rate.name,grade:'',
          description:rate.specification+
            (rate.specification?' · ':'')+
            rate.consumptionPerSqft+' '+rate.priceUnit+' per built-up SFT'+
            ' × '+cash(Number(rate.unitPrice))+'/'+rate.priceUnit,
          allowancePerSqft:rate.ratePerSqft,
          allowanceValue:rate.ratePerSqft,
          unit:'sqft',pricingTreatment:'allowance',
        })),
      });
    }
    return new Response(new Uint8Array(pdf),{
      headers:{
        'Content-Type':'application/pdf',
        'Content-Disposition':'inline; filename="Custom-Package-Preview.pdf"',
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
      },
    });
  } catch {
    return new Response('Custom Package PDF unavailable. Please try again.',{
      status:503,headers:{'Content-Type':'text/plain; charset=utf-8',
        'Cache-Control':'no-store'},
    });
  }
}
