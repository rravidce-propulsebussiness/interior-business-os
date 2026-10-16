import type { CustomerDocument } from './quotation-document';

const esc = (v: string) => v.replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export const premiumCss = `<style>
@page{size:A4;margin:13mm 13mm 16mm}
*{box-sizing:border-box}body{font:11px/1.55 Arial,sans-serif;color:#1b2b44;margin:0;background:#fff}
main{width:100%;max-width:185mm;margin:auto}h1,h2,h3{color:#14233f;line-height:1.2;break-after:avoid}
h1{font-size:27px;letter-spacing:-.04em;margin:0 0 10px}h2{font-size:19px;margin:21px 0 12px}h3{font-size:13px;margin:6px 0}
p{margin:5px 0}.muted{color:#67758a}.text{white-space:pre-wrap;overflow-wrap:anywhere}
img{max-width:100%;object-fit:contain}
header{border-bottom:3px solid __ACCENT__;padding:7px 0 13px;margin-bottom:18px}
header img{max-width:140px;max-height:55px}header h1{font-size:18px;margin:3px 0}header p{color:#68768b}
.pb-cover{height:257mm;max-height:257mm;display:flex;flex-direction:column;position:relative;isolation:isolate;overflow:hidden;padding:17mm 14mm 13mm;background:linear-gradient(130deg,#102038,#213d62);color:#fff;break-after:page;page-break-after:always;break-inside:avoid}
.pb-cover::before{content:"";position:absolute;inset:0;z-index:-1;background:repeating-linear-gradient(135deg,transparent 0 35px,#ffffff15 36px,transparent 37px)}
.pb-cover-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.pb-cover-shade{position:absolute;inset:0;background:linear-gradient(90deg,#0b1e33f5,#0b1e33c4 60%,#0b1e3388);z-index:-1}
.pb-top{display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:68px}
.pb-top img,.pb-close img{background:#fff;border-radius:8px;padding:7px;max-width:145px;max-height:68px}
.pb-company{font-weight:900;font-size:22px;letter-spacing:-.04em;color:#fff}
.pb-tag{border:1px solid #ffffff88;border-radius:30px;padding:7px 12px;font-size:9px;letter-spacing:2px;text-transform:uppercase}
.pb-cover-body{flex:1;display:flex;align-items:center}
.pb-eyebrow{font-size:10px;font-weight:800;color:#ffb77f;text-transform:uppercase;letter-spacing:2px}
.pb-cover h2{font-size:48px;line-height:1.08;letter-spacing:-.07em;margin:18px 0;color:white}
.pb-cover h3{font-size:20px;color:#ffc091;overflow-wrap:anywhere;max-width:145mm}
.pb-cover-amount{font-size:26px;color:white;font-weight:900;margin-top:28px}
.pb-cover-amount small{display:block;color:#ffd0ae;font-size:10px;letter-spacing:1px;text-transform:uppercase}
.pb-bottom{display:flex;justify-content:space-between;gap:20px;padding-top:15px;border-top:1px solid #ffffff55;font-size:11px;color:#dbe7f3;overflow-wrap:anywhere}
.pb-building{position:absolute;bottom:22mm;right:-15mm;width:116mm;height:83mm;border:3px solid white;opacity:.18;transform:skew(-12deg)}
.pb-building::before{content:"";position:absolute;left:-9%;top:-53%;height:50%;width:118%;background:linear-gradient(145deg,transparent 48%,white 49%,white 51%,transparent 52%),linear-gradient(215deg,transparent 48%,white 49%,white 51%,transparent 52%)}
.pb-building::after{content:"";position:absolute;inset:10%;border:2px solid white;background:repeating-linear-gradient(90deg,transparent 0 24%,white 24.6% 25.5%,transparent 26% 49%)}
.pb-title{padding:16px 19px;margin:16px 0;border:1px solid #f3e0cf;border-radius:13px;background:linear-gradient(105deg,#fff1e6,#fff)}
.pb-title h1{font-size:27px;overflow-wrap:anywhere}.pb-title p{color:#62748b}
.status{color:#a25213;font-weight:800;letter-spacing:1px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:20px 0}
.parties section{padding:15px;background:#f7f9fc;border:1px solid #e3eaf1;border-radius:12px;break-inside:avoid;overflow-wrap:anywhere}
.parties h2{font-size:11px;text-transform:uppercase;color:__ACCENT__;letter-spacing:1px;margin:0 0 8px}
.parties h3{font-size:15px}.parties p{font-size:10px}
main>h2{border-left:4px solid __ACCENT__;padding:8px 11px}
table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10px;margin:12px 0}
thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
td,th{border-bottom:1px solid #e2e8ef;padding:9px 7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:#f4efe9;color:#243751;font-weight:800}
.amount{text-align:right;font-variant-numeric:tabular-nums}.line{width:43%}
tr.total{background:#fff0e1;font-weight:900;font-size:13px}
.totals{margin:20px 0 18px auto;width:75%;break-inside:avoid}
.totals .total td{color:#b54c0d;border-top:2px solid __ACCENT__}
section.terms{margin:20px 0;break-inside:auto}
section.terms h2{border-left:4px solid __ACCENT__;padding-left:10px}
section.spec-pages{break-before:page;page-break-before:always;padding-top:10px}
.spec-eyebrow{color:__ACCENT__;letter-spacing:2px;text-transform:uppercase;font-weight:850;font-size:10px}
.spec-pages h2{font-size:23px;color:#14233f}
.package-banner{margin:16px 0;padding:16px;background:linear-gradient(105deg,#fff0e5,#fffaf7);border-left:5px solid __ACCENT__;break-inside:avoid}
.package-banner span{font-size:10px;text-transform:uppercase;color:#9a5925}.package-banner h3{font-size:17px}
.spec-item{display:flex;gap:13px;padding:13px;margin:8px 0;border:1px solid #e4e9ef;border-left:3px solid __ACCENT__;border-radius:10px;background:#fff;break-inside:avoid}
.spec-item h3{font-size:14px;color:#172745}.spec-item p{font-size:11px;color:#4a5970}
.spec-number{min-width:30px;height:30px;display:grid;place-items:center;color:__ACCENT__;background:#fff1e5;border-radius:8px;font-weight:900}
.material-choices{padding:15px;background:#fff9f3;border:1px solid #f2ddcc;margin:18px 0}
.additional-work{font-size:9px;text-transform:uppercase;color:__ACCENT__}
.pb-photo{margin:18px 0;border-radius:12px;overflow:hidden;border:1px solid #e2e8ef;break-inside:avoid}
.pb-photo img{width:100%;height:68mm;object-fit:cover;display:block}
.pb-photo figcaption{padding:8px 12px;background:#f4f6f9;color:#52617b;font-size:10px}
.pb-close{break-before:page;page-break-before:always;min-height:242mm;display:flex;flex-direction:column;justify-content:space-between;padding:20mm 15mm;background:linear-gradient(145deg,#10213b,#1d395d);border-bottom:6px solid __ACCENT__;color:#fff;break-inside:avoid}
.pb-close h2{color:#fff;font-size:38px;letter-spacing:-.06em;margin:35mm 0 17px}
.pb-close p{color:#e4edf8;font-size:14px}
.pb-contact{border-top:1px solid #ffffff66;padding-top:15px;display:grid;grid-template-columns:1fr 1fr;gap:15px;font-size:11px;overflow-wrap:anywhere}
.pb-contact strong{display:block;color:#ffbc8b;font-size:10px;text-transform:uppercase;letter-spacing:1px}
.pb-fine{font-size:10px!important;color:#cbd7e7!important}
@media screen{body{background:#f0f3f7;padding:20px;overflow-x:auto}main{width:185mm;min-width:185mm;max-width:none;padding:15px;background:#fff;box-shadow:0 10px 32px #15264022}.pb-cover{height:760px;max-height:none}.pb-close{min-height:700px}}
@media print{body,main{margin:0;padding:0;max-width:none;box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>`;

export function premiumSections(d: CustomerDocument) {
  const brand = d.header.branding;
  const company = esc(brand.name);
  const logo = brand.logo_data_uri;
  const site = esc([brand.address.line1,brand.address.city,brand.address.region,brand.address.country_code].filter(Boolean).join(', '));
  const coverImage = brand.cover_image_data_uri ?? '';
  const detailImage = brand.detail_image_data_uri ?? '';
  const logoTag = logo ? '<img alt="Company logo" src="'+esc(logo)+'">' : '<span class="pb-company">'+company+'</span>';
  const value = new Intl.NumberFormat('en-IN',{style:'currency',currency:d.currency,maximumFractionDigits:2}).format(Number(d.totals.final_amount));
  const cover = '<section class="pb-cover">'+
    (coverImage ? '<img class="pb-cover-photo" alt="Company-supplied building photograph" src="'+esc(coverImage)+'"><div class="pb-cover-shade"></div>' : '<div class="pb-building" aria-hidden="true"></div>')+
    '<div class="pb-top">'+logoTag+'<span class="pb-tag">Quotation proposal</span></div>'+
    '<div class="pb-cover-body"><div><span class="pb-eyebrow">Prepared for '+esc(d.header.customer.name)+'</span>'+
    '<h2>Building your<br>next chapter.</h2><h3>'+esc(d.header.project.name)+'</h3>'+
    '<p>'+esc(d.number)+' · Revision '+d.revision+'</p>'+
    '<div class="pb-cover-amount"><small>Proposed project investment</small>'+esc(value)+'</div></div></div>'+
    '<div class="pb-bottom"><div><strong>'+company+'</strong>'+site+'</div>'+
    '<div>Valid until '+esc(d.valid_until)+'<p>'+esc(d.status.toUpperCase())+'</p></div></div></section>';
  const photo = detailImage ? '<figure class="pb-photo"><img alt="Company-supplied project photo" src="'+esc(detailImage)+'">'+
    '<figcaption>Project inspiration · supplied by '+company+'</figcaption></figure>' : '';
  const end = '<section class="pb-close"><div>'+logoTag+
    '<h2>Thank you for<br>considering '+company+'.</h2>'+
    '<p>We look forward to discussing your plans together.</p></div>'+
    '<div><div class="pb-contact"><div><strong>Contact</strong>'+esc(brand.phone)+'<br>'+esc(brand.email)+'</div>'+
    '<div><strong>Location</strong>'+site+'</div></div>'+
    '<p class="pb-fine">Quotation '+esc(d.number)+' · Revision '+d.revision+
    '. This proposal is not a signed contract. Scope and prices are governed by the written quotation and terms.</p></div></section>';
  return {cover,photo,end};
}
