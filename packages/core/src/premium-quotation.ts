import type { CustomerDocument } from './quotation-document';

const escape = (value: string) => value.replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// Curated architectural concept photos, not representations of a tenant's past
// work. Companies override all of these from their saved quotation branding.
// Every illustration is explicitly marked as a concept in the customer PDF.
// https://unsplash.com/license (free photographs).
const conceptVilla = 'https://images.unsplash.com/photo-1756435292384-1bf32eff7baf?auto=format&fit=crop&w=1500&q=80';
const conceptInterior = 'https://images.unsplash.com/photo-1751945965597-71171ec7a458?auto=format&fit=crop&w=1400&q=80';

const friendlyDate = (value: string): string => {
  const date = new Date(value + 'T12:00:00Z');
  return Number.isNaN(date.getTime()) ? value :
    new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
};

export const premiumCss = `<style>
@page { size:A4; margin:12mm 13mm 14mm; }
* { box-sizing:border-box; }
html { color-scheme:light; }
body { margin:0; color:#17253e; background:#fff; font:11px/1.55 Arial,Helvetica,sans-serif; }
main { width:100%; max-width:184mm; margin:0 auto; }
h1,h2,h3 { color:#112440; line-height:1.16; break-after:avoid; }
p { margin:5px 0; }
img { max-width:100%; display:block; }
.text { white-space:pre-wrap; overflow-wrap:anywhere; }
.muted { color:#66758c; }
.amount { text-align:right; font-variant-numeric:tabular-nums; }
.pb-cover {
  height:260mm; min-height:260mm; max-height:260mm; overflow:hidden;
  page-break-after:always; break-after:page; break-inside:avoid;
  position:relative; isolation:isolate; padding:17mm 13mm 12mm;
  background:linear-gradient(125deg,#08182e,#122a4a 68%,#1a3b5b);
  display:flex; flex-direction:column; color:#fff;
}
.pb-cover-photo {
  position:absolute; z-index:-3; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:63% center;
}
.pb-cover-shade {
  position:absolute; z-index:-2; inset:0;
  background:linear-gradient(90deg,rgba(5,17,34,.98) 0%,rgba(8,22,41,.93) 38%,rgba(10,23,40,.40) 80%,rgba(5,14,27,.20));
}
.pb-cover-photo-fallback {
  z-index:-4; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(circle at 86% 45%,#b66d3760,transparent 43%),
   linear-gradient(140deg,#08182e,#183b5b);
}
.pb-cover-top {
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
}
.pb-company-name { font-size:26px; font-weight:900; letter-spacing:-1.4px; color:#fff; }
.pb-company-name b { color:#ff872d; }
.pb-cover-logo { max-height:65px; max-width:155px; background:#fff; padding:7px; border-radius:8px; }
.pb-subbrand { display:block; color:#d8e3f3; letter-spacing:3px; text-transform:uppercase; font-size:9px; font-weight:700; margin-top:5px; }
.pb-proposal-tag { display:block; font-size:10px; border:1px solid #dce9f6ab; padding:7px 13px; border-radius:24px; letter-spacing:1.8px; white-space:nowrap; color:#ecf4ff; text-transform:uppercase; }
.pb-cover-main { display:flex; align-items:center; flex:1; min-height:0; }
.pb-cover-copy { max-width:84%; }
.pb-cover-kicker { font-size:10px; letter-spacing:3px; color:#ffaa70; font-weight:850; text-transform:uppercase; }
.pb-cover h1 { color:#fff; font:bold 47px/1.05 Georgia,'Times New Roman',serif; letter-spacing:-2px; margin:19px 0 17px; }
.pb-cover h1 em { font-style:normal; color:#ff984f; }
.pb-cover-project { font-size:19px; color:#fff; font-weight:750; margin:5px 0 7px; }
.pb-cover-number { color:#e4eff8; font-size:12px; margin-top:5px; }
.pb-investment {
  margin-top:23px; padding:13px 18px;
  border:1px solid #d9e7f654; border-left:4px solid #ff7420;
  border-radius:13px; background:#112944bd; width:max-content; max-width:100%;
}
.pb-investment small { display:block; font-size:10px; letter-spacing:2px; font-weight:850; color:#e2ecf7; text-transform:uppercase; margin-bottom:4px; }
.pb-investment strong { font-size:26px; font-weight:900; color:#ff9a53; overflow-wrap:anywhere; }
.pb-cover-bottom {
  border-top:1px solid #ffffff80; padding-top:16px;
  display:flex; align-items:center; justify-content:space-between; gap:18px;
  font-size:11px; color:#e6edf7;
}
.pb-cover-bottom strong { color:#fff; display:block; font-size:12px; }
.pb-cover-bottom .pb-cover-client { max-width:55%; }
.pb-cover-bottom .pb-cover-status { text-align:right; }
.pb-cover-photo-note { font-size:9px; color:#ffdfc7; padding-top:8px; }
.pb-page {
  position:relative; background:white;
  break-before:page; page-break-before:always;
  padding:5mm 0 8mm; min-height:0;
}
.pb-page-header {
  display:flex; justify-content:space-between; align-items:center; gap:13px;
  padding:0 0 12px; border-bottom:1px solid #e1e7ef; margin-bottom:16px;
}
.pb-brand-name { font-size:19px; font-weight:900; color:#122542; letter-spacing:-.7px; }
.pb-brand-name b { color:#ed6114; }
.pb-page-header small { text-transform:uppercase; letter-spacing:1.6px; font-size:9px; color:#586a83; font-weight:800; }
.pb-page-footer { margin-top:15px; padding:12px 0 0; display:flex; justify-content:space-between; gap:12px; border-top:1px solid #dfe5ed; color:#75839a; font-size:9px; }
.pb-section-title { display:flex; align-items:center; gap:10px; margin:19px 0 9px; }
.pb-section-title h2 { font:bold 24px/1.15 Georgia,'Times New Roman',serif; margin:0; color:#15263f; }
.pb-section-title::before { content:""; width:5px; height:28px; background:__ACCENT__; border-radius:4px; flex:0 0 5px; }
.pb-section-subtitle { font-size:10px; color:#697991; margin:3px 0 13px; }
.pb-intro-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:15px 0 19px; }
.pb-intro-card { border-radius:13px; padding:15px; border:1px solid #e8e7e4; min-width:0; break-inside:avoid; background:#fff8f2; }
.pb-intro-card.project { background:#f1f6ff; border-color:#dee8fc; }
.pb-intro-card .pb-mini-head { display:flex; align-items:center; gap:9px; color:#a44d16; margin-bottom:9px; font-size:9px; font-weight:850; text-transform:uppercase; letter-spacing:1.4px; }
.pb-intro-card.project .pb-mini-head { color:#2b65b6; }
.pb-intro-icon { display:grid; place-items:center; background:#ffdfca; color:#e15a11; border-radius:50%; width:32px; height:32px; flex:0 0 32px; font-size:18px; }
.pb-intro-card.project .pb-intro-icon { background:#dae7fc; color:#3973c6; }
.pb-intro-card h3 { font-size:14px; font-weight:850; margin:5px 0 10px; overflow-wrap:anywhere; }
.pb-intro-card p { color:#52627a; font-size:10px; overflow-wrap:anywhere; }
.pb-project-photo { height:52mm; margin:0 0 14px; position:relative; overflow:hidden; border-radius:13px; background:linear-gradient(120deg,#142845,#415a70); break-inside:avoid; }
.pb-project-photo img { width:100%; height:100%; object-fit:cover; }
.pb-project-photo .pb-project-photo-shade { position:absolute; inset:0; background:linear-gradient(90deg,#0b203bed 0%,#0b203b66 70%,transparent 100%); }
.pb-project-photo .pb-project-photo-text { position:absolute; top:50%; left:15px; transform:translateY(-50%); max-width:70%; font-size:20px; font-weight:850; color:#fff; }
.pb-project-photo .pb-project-photo-text small { display:block; font-size:9px; letter-spacing:1.8px; text-transform:uppercase; color:#ffb887; margin-bottom:9px; }
.pb-project-photo .pb-photo-illustrative { position:absolute; right:8px; bottom:7px; padding:3px 6px; border-radius:5px; color:#fff; background:#0008; font-size:8px; }
.pb-quote-meta { font-size:10px; color:#7b8698; margin:8px 0; }
.pb-estimate table { border-collapse:collapse; width:100%; table-layout:fixed; margin:11px 0; border:1px solid #e8edf3; }
table { width:100%; border-collapse:collapse; table-layout:fixed; margin:10px 0; }
thead { display:table-header-group; }
tr { break-inside:avoid; page-break-inside:avoid; }
th,td { padding:10px 7px; vertical-align:top; text-align:left; border-bottom:1px solid #e4eaf0; font-size:10px; overflow-wrap:anywhere; }
th { color:#253957; background:#edf2f8; font-weight:850; }
tr.total { background:#fff0e5; color:#c3450a; font-weight:850; }
tr.total td { border-top:1px solid #ffc7aa; }
.pb-estimate .total td { font-weight:850; font-size:11px; }
.pb-estimate .total td:last-child { color:#e45710; }
.pb-estimate .line { width:30%; }
.pb-estimate .amount, .pb-estimate .amount:last-child { white-space:normal; }
.pb-final-total { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px; background:#fff0e6; border:1px solid #ffd2b4; border-radius:12px; margin:15px 0; break-inside:avoid; }
.pb-final-total span { font-size:12px; font-weight:850; color:#4b5a70; }
.pb-final-total strong { font-size:21px; font-weight:900; color:#c34a0c; text-align:right; }
.pb-adjustments { background:#faf8f5; border:1px solid #ece4dc; border-radius:10px; padding:10px 13px; margin:15px 0; }
.pb-adjustments p { display:flex; justify-content:space-between; gap:10px; font-size:10px; color:#57667e; }
.pb-adjustments strong { color:#243750; }
.pb-pricing-caption { color:#7b8596; font-size:9px; line-height:1.5; }
.pb-specs-page { break-before:page; page-break-before:always; }
.pb-material-hero { display:flex; align-items:center; justify-content:space-between; gap:12px; overflow:hidden; border-radius:12px; background:linear-gradient(110deg,#0c1c35,#233e5a); color:#fff; position:relative; min-height:50mm; padding:16px; margin-bottom:16px; break-inside:avoid; }
.pb-material-hero > img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.pb-material-hero:before { content:""; position:absolute; inset:0; background:linear-gradient(90deg,#0c1c35f8,#0c1c35cd 52%,#0c1c3566 100%); }
.pb-material-hero-content { position:relative; z-index:1; width:72%; }
.pb-material-hero h2 { font:bold 24px/1.13 Georgia,'Times New Roman',serif; margin:0 0 11px; color:#fff; }
.pb-material-hero p { color:#e1eaf6; font-size:10px; max-width:80%; }
.pb-material-hero small { display:block; text-transform:uppercase; letter-spacing:2px; font-size:9px; color:#ffab72; font-weight:850; margin-bottom:11px; }
.pb-illustrative-label { position:absolute; bottom:8px; right:10px; background:#0b1c2fc7; color:#fff; font-size:8px; padding:4px 6px; border-radius:5px; z-index:1; }
.pb-spec-card-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:13px 0 18px; }
.spec-item { display:block; break-inside:avoid; border-radius:12px; border:1px solid #e7ebf0; background:#fff; padding:13px; box-shadow:0 2px 8px #0d22360a; min-width:0; }
.spec-item h3 { font-size:13px; font-weight:850; color:#162841; margin:10px 0 7px; }
.spec-item p { color:#586982; font-size:10px; line-height:1.5; }
.spec-number { display:grid; place-items:center; width:33px; height:33px; border-radius:9px; color:#ee6217; background:#fff0e6; font-weight:850; font-size:11px; }
.pb-specs-page .spec-item { border-left:3px solid #ff7e35; }
.pb-specs-page .spec-item:nth-child(3n + 1) { background:linear-gradient(140deg,#fff6ee,#fff); }
.pb-specs-page .spec-item:nth-child(3n + 2) { background:linear-gradient(140deg,#f3f8ff,#fff); }
.pb-specs-page .spec-item:nth-child(3n + 3) { background:linear-gradient(140deg,#f5faf8,#fff); }
.pb-specs-page .spec-item .spec-number::before { content:"◆"; margin-right:2px; }
.pb-specs-page .spec-item h3 { overflow-wrap:anywhere; }
.pb-specs-page .spec-item p strong { color:#172d49; }
.pb-spec-card-grid > .pb-package-specifications {
  grid-column:1/-1; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;
}
.pb-package-specifications .pb-spec-package,
.pb-package-specifications .material-choices,
.pb-package-specifications .pb-material-footnote { grid-column:1/-1; }
.pb-package-specifications .pb-material-footnote { margin:0 0 8px; }
.pb-spec-card-grid > .spec-item { min-width:0; }
.pb-spec-card-grid .pb-package-specifications .spec-item { margin:0; }
.pb-specs-page .spec-item p.text { white-space:pre-line; }
.pb-specs-page .pb-spec-card-grid > .pb-package-specifications .material-choices {
  background:#fff9f4; border-color:#f0dfd1;
}

.pb-spec-package { padding:14px 16px; border-radius:11px; background:#fff1e6; border-left:4px solid __ACCENT__; margin:12px 0; }
.pb-spec-package h3 { margin:3px 0 6px; font-size:15px; }
.pb-spec-package p { color:#586a83; font-size:11px; }
.material-choices { margin:16px 0; border-radius:10px; background:#f7f9fc; padding:14px; border:1px solid #e4eaf0; }
.material-choices h3 { font-size:13px; margin:0 0 10px; }
.material-choices p { font-size:10px; padding:7px 0; border-bottom:1px solid #e8edf3; }
.pb-material-footnote { font-size:9px; color:#6c798a; margin:10px 0; }
.pb-payment-page h2, section.terms h2 { color:#1c2d47; font-size:19px; border-left:4px solid __ACCENT__; padding-left:11px; margin:14px 0; }
.pb-payment-page table { border:1px solid #e7ebf1; }
.pb-payment-page tbody tr:nth-child(even) { background:#fffaf6; }
.pb-payment-page tr.total { background:#ffe6d5!important; }
.pb-payment-page .text { white-space:pre-wrap; }
.pb-terms-panel { background:#faf8f5; border:1px solid #e7e0d7; padding:14px; border-radius:10px; margin:16px 0; }
.pb-terms-panel h2 { font-size:14px; }
.pb-quote-conditions { break-inside:auto; }
.pb-quote-conditions > h2 { margin:0 0 12px; }
.pb-term-section { border-top:1px solid #e6e0d8; padding:12px 0; break-inside:avoid; }
.pb-term-section:first-of-type { border-top:0; }
.pb-term-section h3 { margin:0 0 5px; color:__ACCENT__; font-size:12px; font-weight:850; }
.pb-term-section .text { margin:0; white-space:pre-wrap; font-size:10px; line-height:1.65; }
.pb-end {
  break-before:page; page-break-before:always; break-inside:avoid;
  min-height:255mm; padding:20mm 13mm 13mm; position:relative; overflow:hidden;
  display:flex; flex-direction:column; justify-content:space-between;
  background:linear-gradient(130deg,#101e36,#213d60); color:#fff;
}
.pb-end-photo { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.pb-end-shade { position:absolute; inset:0; background:linear-gradient(90deg,#091b34fa,#0e2947ca 65%,#0f284258); }
.pb-end-content { position:relative; z-index:1; }
.pb-end h2 { color:#fff; font:bold 41px/1.1 Georgia,'Times New Roman',serif; max-width:140mm; margin:35mm 0 15px; }
.pb-end h2 em { color:#ff9147; font-style:normal; }
.pb-end p { font-size:13px; color:#dce9f8; }
.pb-end-bottom { position:relative; z-index:1; border-radius:14px; background:#ffffffee; padding:18px; color:#192b47; overflow-wrap:anywhere; }
.pb-end-bottom .pb-company-name { color:#162844; font-size:21px; }
.pb-end-bottom p { color:#3c4e69; font-size:10px; }
.pb-end-bottom strong { color:#d35510; font-size:10px; text-transform:uppercase; letter-spacing:1px; }
.pb-end-contact { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:12px; }
.pb-end-disclaimer { margin-top:16px; font-size:9px!important; }
@media screen {
 body { padding:16px; background:#edf2f8; overflow-x:hidden; }
 main { max-width:184mm; width:100%; }
 .pb-cover,.pb-page,.pb-end { width:100%; margin:0 auto 16px; border-radius:13px; box-shadow:0 9px 30px #132a4b20; }
 .pb-page { padding:20px; min-height:250mm; }
 .pb-cover { height:255mm; min-height:255mm; max-height:none; }
 .pb-end { min-height:245mm; }
}
@media screen and (max-width:720px) {
 body { padding:8px; margin:0; }
 main { width:100%; max-width:none; min-width:0; }
 .pb-cover,.pb-page,.pb-end { width:100%; min-width:0; max-width:100%; margin:0 auto 12px; border-radius:11px; }
 .pb-page { padding:14px 12px; min-height:0; }
 .pb-cover { min-height:calc((100vw - 16px) * 1.414); height:auto; max-height:none; padding:25px 19px 21px; }
 .pb-cover h1 { font-size:clamp(31px,9vw,45px); }
 .pb-company-name { font-size:22px; }
 .pb-proposal-tag { font-size:8px; letter-spacing:1px; padding:6px 8px; }
 .pb-cover-copy { max-width:94%; }
 .pb-investment { margin-top:19px; padding:11px; }
 .pb-investment strong { font-size:clamp(19px,6vw,27px); }
 .pb-cover-bottom { gap:7px; font-size:9px; }
 .pb-page-header { margin-bottom:12px; }
 .pb-brand-name { font-size:16px; }
 .pb-page-header small { font-size:8px; }
 .pb-section-title h2 { font-size:21px; }
 .pb-intro-grid { gap:8px; }
 .pb-intro-card { padding:10px; }
 .pb-intro-card h3 { font-size:11px; }
 .pb-intro-card p { font-size:9px; }
 .pb-intro-icon { width:25px; height:25px; flex-basis:25px; font-size:13px; }
 .pb-project-photo { height:140px; }
 .pb-project-photo .pb-project-photo-text { font-size:15px; }
 th,td { font-size:9px; padding:8px 4px; }
 .pb-estimate .total td { font-size:10px; }
 .pb-estimate .line { width:27%; }
 .pb-final-total strong { font-size:18px; }
 .pb-material-hero { min-height:170px; }
 .pb-material-hero h2 { font-size:24px; }
 .pb-material-hero-content { width:87%; }
 .pb-spec-card-grid { gap:7px; }
 .spec-item { padding:10px; }
 .spec-item h3 { font-size:11px; }
 .spec-item p { font-size:9px; }
 .pb-end { min-height:calc((100vw - 16px) * 1.414); padding:24px 19px 18px; }
 .pb-end h2 { font-size:30px; margin:30px 0 15px; }
 .pb-end-bottom { padding:12px; }
 .pb-end-contact { gap:10px; }
}
@media print {
 body,main { max-width:none; padding:0; margin:0; background:#fff; }
 .pb-cover,.pb-page,.pb-end { border-radius:0; box-shadow:none; }
 .pb-page { min-height:0; padding:0; }
 .pb-cover { height:260mm; min-height:260mm; max-height:260mm; }
 .pb-end { min-height:255mm; }
 * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
</style>`;

export function premiumSections(document: CustomerDocument) {
  const brand = document.header.branding;
  const rawCompany = brand.name.trim();
  const firstSpace = rawCompany.indexOf(' ');
  const prefix = firstSpace >= 0 ? rawCompany.slice(0, firstSpace) : rawCompany;
  const suffix = firstSpace >= 0 ? rawCompany.slice(firstSpace) : '';
  const companyName = '<span class="pb-company-name"><b>'+escape(prefix)+'</b>'+escape(suffix)+'</span>';
  const miniBrand = '<span class="pb-brand-name"><b>'+escape(prefix)+'</b>'+escape(suffix)+'</span>';
  const contact = [brand.address.line1,brand.address.line2,brand.address.city,
    brand.address.region,brand.address.postal_code].filter(Boolean).map(escape).join(', ');
  const siteAddress = document.header.project.site_address;
  const location = [siteAddress.city, siteAddress.region].filter(Boolean).map(escape).join(', ');
  const projectImage = brand.detail_image_data_uri || conceptInterior;
  const houseImage = brand.cover_image_data_uri || conceptVilla;
  const materialImage = brand.materials_image_data_uri || projectImage;
  const conceptCover = !brand.cover_image_data_uri;
  const conceptDetail = !brand.detail_image_data_uri;
  const conceptMaterial = !brand.materials_image_data_uri;
  const logo = brand.logo_data_uri ? '<img class="pb-cover-logo" alt="Company logo" src="'+escape(brand.logo_data_uri)+'">' : companyName;
  const number = escape(document.number);
  const displayMoney = new Intl.NumberFormat('en-IN',{style:'currency',currency:document.currency,
    maximumFractionDigits:2,minimumFractionDigits:2}).format(Number(document.totals.final_amount));
  const valid = friendlyDate(document.valid_until);
  const proposalImage = '<img class="pb-cover-photo" src="'+escape(houseImage)+'" alt="'+
    (conceptCover ? 'Illustrative architectural concept' : 'Company-provided project photograph')+'">';
  const cover = '<section class="pb-cover"><div class="pb-cover-photo-fallback"></div>'+proposalImage+
    '<div class="pb-cover-shade"></div><div class="pb-cover-top"><div>'+logo+
    '<span class="pb-subbrand">Quotation proposal</span></div>'+
    '<span class="pb-proposal-tag">Project proposal</span></div>'+
    '<div class="pb-cover-main"><div class="pb-cover-copy">'+
    '<div class="pb-cover-kicker">Prepared for '+escape(document.header.customer.name)+'</div>'+
    '<h1>Building your<br>next <em>chapter.</em></h1>'+
    '<p class="pb-cover-project">'+escape(document.header.project.name)+'</p>'+
    '<p class="pb-cover-number">'+number+' · Revision '+document.revision+'</p>'+
    '<div class="pb-investment"><small>Total project cost</small>'+
    '<strong>'+escape(displayMoney)+'</strong></div>'+
    '</div></div>'+
    '<div class="pb-cover-bottom"><div class="pb-cover-client"><strong>Prepared for '+escape(document.header.customer.name)+'</strong>'+
    (location || contact)+'</div><div class="pb-cover-status"><strong>Valid until '+escape(valid)+'</strong>'+
    escape(document.status.toUpperCase())+'</div></div>'+
    (conceptCover ? '<div class="pb-cover-photo-note">Illustrative architectural concept; not an image of the proposed project.</div>' : '')+
    '</section>';
  const photoPage = '<div class="pb-project-photo"><img alt="'+
    (conceptDetail ? 'Illustrative interior concept image' : 'Company-supplied project photograph')+
    '" src="'+escape(projectImage)+'"><div class="pb-project-photo-shade"></div>'+
    '<div class="pb-project-photo-text"><small>Project proposal</small>'+
    escape(document.header.project.name)+'</div>'+
    (conceptDetail ? '<div class="pb-photo-illustrative">Illustrative concept</div>' : '')+
    '</div>';
  const specHero = '<div class="pb-material-hero"><img alt="'+
    (conceptMaterial ? 'Illustrative interior and finishes' : 'Company-supplied materials photograph')+
    '" src="'+escape(materialImage)+'"><div class="pb-material-hero-content">'+
    '<small>Project specifications</small><h2>Materials &amp;<br>Specifications</h2>'+
    '<p>Only the brands, grades, allowances and inclusions saved in this quotation are specified below.</p></div>'+
    (conceptMaterial ? '<span class="pb-illustrative-label">Illustrative concept</span>' : '')+'</div>';
  const close = '<section class="pb-end"><img class="pb-end-photo" src="'+escape(houseImage)+'" alt="Architectural background">'+
    '<div class="pb-end-shade"></div><div class="pb-end-content">'+logo+
    '<h2>Thank you for<br>considering <em>'+escape(rawCompany)+'.</em></h2>'+
    '<p>We look forward to discussing your project and its next steps together.</p></div>'+
    '<div class="pb-end-bottom">'+companyName+
    '<div class="pb-end-contact"><div><strong>Contact</strong><p>'+escape(brand.phone)+
    '<br>'+escape(brand.email)+'</p></div><div><strong>Office</strong><p>'+
    (contact || 'Address available on request')+'</p></div></div>'+
    '<p class="pb-end-disclaimer">Quotation '+number+' · Revision '+document.revision+
    '. This proposal is not a signed construction contract. The saved specifications and written terms govern its scope.</p>'+
    (conceptCover ? '<p class="pb-end-disclaimer">Background is an illustrative architecture image.</p>' : '')+
    '</div></section>';
  const pageHeader = (label: string) =>
    '<div class="pb-page-header">'+miniBrand+'<small>'+escape(label)+'</small></div>';
  const pageFooter = (label: string) =>
    '<div class="pb-page-footer"><span>'+number+' · Revision '+document.revision+
    '</span><strong>'+escape(label)+'</strong></div>';
  return { cover, photoPage, specHero, close, pageHeader, pageFooter };
}
