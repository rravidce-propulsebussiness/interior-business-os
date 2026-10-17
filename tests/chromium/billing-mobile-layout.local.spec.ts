import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(),
  'apps/business-app/src/app/dashboard/billing/billing-premium.css'), 'utf8');

const fixture = [
  '<!doctype html><html lang="en"><head>',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<style>*,*:before,*:after{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#fafbfd;}',
  css, '</style></head><body>',
  '<main class="billing-v2">',
  '<div class="billing-heading"><div><p class="billing-eyebrow">FINANCE / BILLING</p>',
  '<h1>Billing</h1><p>Manage invoices, supplier bills, GST details and financial records.</p>',
  '</div><form class="billing-period"><select aria-label="Billing date range"><option>This month</option></select><button>Apply</button></form></div>',
  '<section class="billing-stats" aria-label="Billing summary">',
  ...['Sales invoiced','Purchase bills','Documents','Draft documents'].map((item,index) =>
    '<div class="billing-stat"><span class="billing-stat-symbol warm">₹</span><div><p>'+item+'</p>'+
    '<strong>'+(index===0?'₹59,20,000':index===1?'₹12,20,000':'14')+'</strong><small>Company billing record</small></div></div>'),
  '</section><div class="billing-layout"><div class="billing-left">',
  '<section class="billing-panel billing-template"><div class="billing-panel-heading"><div><h2>Invoice design &amp; billing</h2></div></div>',
  '<div class="billing-template-grid"><div class="billing-template-feature"><div class="billing-template-top"><h3>Standard invoice</h3></div>',
  '<p>Professional invoices and supplier bills using company details.</p>',
  '<div class="billing-template-buttons"><a class="billing-primary" href="#">New invoice</a><a class="billing-secondary" href="#profile">Billing settings</a></div>',
  '</div><div class="billing-inclusions"><h3>Included in your billing workspace</h3><p>Sales invoices and supplier bills</p>',
  '<p>GST-ready calculations</p></div><div class="billing-illustration"></div></div></section>',
  '<section class="billing-panel billing-register" id="documents">',
  '<div class="billing-panel-heading"><div><h2>Invoices &amp; Bills</h2></div></div>',
  '<nav class="billing-tabs"><a class="active" href="#">All documents</a><a href="#">Sales invoices</a><a href="#">Purchase bills</a><a href="#">Marketplace incoming</a></nav>',
  '<form class="billing-document-search"><input aria-label="Search billing documents" placeholder="Search invoice…" /><button>Search</button></form>',
  '<div class="billing-table-wrap"><table><thead><tr><th>Invoice / Bill</th><th>Party</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>',
  '<tbody><tr><td>INV-2026-001</td><td>Client with a reasonably long company name</td><td>17 Oct 2026</td><td>₹59,20,000</td><td>Issued</td><td>Open</td></tr></tbody>',
  '</table></div>',
  '<div class="billing-mobile-docs"><a href="#" class="billing-mobile-doc">',
  '<span class="billing-mobile-doc-top"><strong>INV-2026-001</strong><span class="billing-status billing-status-issued">Issued</span></span>',
  '<span class="billing-mobile-doc-party">Client with a reasonably long company name</span>',
  '<span class="billing-mobile-doc-foot"><span>Sales invoice · 17 Oct 2026</span><strong>₹59,20,000</strong></span>',
  '</a></div>',
  '<div class="billing-register-footer"><span>Showing 1 document</span><a href="#">GST filing workpapers</a></div></section>',
  '<section class="billing-panel billing-tools"><div class="billing-tools-grid"><a class="billing-tool" href="#"><span class="billing-tool-icon blue">₹</span>',
  '<span><strong>GST reports</strong><small>Prepare filing workpapers</small></span></a></div></section>',
  '</div><aside class="billing-right">',
  '<section class="billing-panel billing-profile" id="profile"><div class="billing-panel-heading"><h2>Billing Address &amp; GST</h2></div>',
  '<div class="billing-profile-row"><span class="billing-profile-icon">✓</span><div><strong>Company business name</strong>',
  '<p>Hyderabad registered billing address, Telangana, India</p></div></div></section>',
  '<section class="billing-panel billing-quick"><div class="billing-panel-heading"><h2>Quick actions</h2></div>',
  '<a href="#"><span class="billing-quick-icon">+</span><span><strong>Create sales invoice</strong><small>Prepare a new invoice</small></span></a>',
  '<a href="#"><span class="billing-quick-icon">+</span><span><strong>Record supplier bill</strong><small>Register a received bill</small></span></a></section>',
  '<section class="billing-panel billing-activity"><div class="billing-panel-heading"><h2>Recent documents</h2></div>',
  '<a class="billing-activity-item" href="#"><span class="billing-activity-icon sales">₹</span>',
  '<span class="billing-activity-info"><strong>Client with a reasonably long company name</strong>',
  '<small>INV-2026-001 · 17 Oct 2026</small></span><span class="billing-activity-meta"><strong>₹59,20,000</strong></span></a></section>',
  '</aside></div></main></body></html>',
].join('');

test('premium billing layout has no clipped document controls or horizontal overflow at phone and desktop widths',
  async ({page}) => {
    await page.setContent(fixture, {waitUntil:'load'});
    for(const width of [320,360,390,430,700,768,1024,1440]) {
      await page.setViewportSize({width,height:900});
      const dimensions=await page.evaluate(()=>({
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
      }));
      if(dimensions.scrollWidth>dimensions.clientWidth+1) {
        const offenders=await page.evaluate(()=>
          [...document.querySelectorAll('body *')].map(el=>{
            const r=el.getBoundingClientRect();
            return {tag:el.tagName,cls:String(el.className).slice(0,80),
              x:Math.round(r.x),right:Math.round(r.right),width:Math.round(r.width)};
          }).filter(x=>x.right>document.documentElement.clientWidth+1).slice(0,20));
        console.log('Billing overflow at',width,'px:',JSON.stringify(offenders));
      }
      expect(dimensions.scrollWidth, 'Horizontal overflow at '+width+'px')
        .toBeLessThanOrEqual(dimensions.clientWidth + 1);
      await expect(page.locator('.billing-stats .billing-stat')).toHaveCount(4);
      await expect(page.locator('.billing-primary')).toBeVisible();
      await expect(page.locator('.billing-quick a').first()).toBeVisible();
      if(width<=660) {
        await expect(page.locator('.billing-mobile-doc')).toBeVisible();
        await expect(page.locator('.billing-table-wrap')).toBeHidden();
        const rows=await page.locator('.billing-mobile-doc').boundingBox();
        expect(rows).not.toBeNull();
        expect(rows!.width).toBeGreaterThan(190);
        expect(rows!.x).toBeGreaterThanOrEqual(0);
        expect(rows!.x+rows!.width).toBeLessThanOrEqual(width+1);
      } else {
        await expect(page.locator('.billing-mobile-docs')).toBeHidden();
        await expect(page.locator('.billing-table-wrap')).toBeVisible();
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('textbox',{name:'Search billing documents'}).fill('INV-2026-001');
    await expect(page.getByRole('textbox',{name:'Search billing documents'}))
      .toHaveValue('INV-2026-001');
  });
