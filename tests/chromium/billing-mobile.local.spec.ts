import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(),
  'apps/business-app/src/app/dashboard/billing/billing-premium.css'), 'utf8');

// Authenticated data is tenant-scoped and cannot be faked in a public test
// session. This fixture exercises the exact production CSS with long values,
// the responsive register, controls, and GST profile.
const markup = [
  '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>html,body{margin:0;padding:0;background:#fafbfd;font-family:Arial,sans-serif;}',
  css, '</style></head><body>',
  '<main class="billing-v2">',
  '<div class="billing-heading"><div><p class="billing-eyebrow">FINANCE / BILLING</p><h1>Billing</h1>',
  '<p>Manage invoices, supplier bills, GST details and financial records.</p></div>',
  '<form class="billing-period"><svg width="16" height="16"></svg>',
  '<select aria-label="Billing date range"><option>This month</option></select><button type="submit">Apply</button></form></div>',
  '<section class="billing-stats" aria-label="Billing summary">',
  ...['Sales invoiced|₹1,28,54,21,000','Purchase bills|₹78,90,12,400','Documents|100','Draft documents|25']
    .map(item => {
      const [name,amount]=item.split('|');
      return '<div class="billing-stat"><span class="billing-stat-symbol warm"><svg width="25" height="25"></svg></span>' +
        '<div><p>'+name+'</p><strong>'+amount+'</strong><small>Summary of latest documents</small></div></div>';
    }),
  '</section><p class="billing-coverage">Figures based on latest 100 register entries</p>',
  '<div class="billing-layout"><div class="billing-left">',
  '<section class="billing-panel billing-template">',
  '<div class="billing-panel-heading"><div><h2>Invoice design & billing</h2></div></div>',
  '<div class="billing-template-grid"><div class="billing-template-feature">',
  '<div class="billing-template-top"><span class="billing-crown">▤</span>',
  '<div><h3>Professional GST Invoice Standard Format</h3><span class="billing-current-tag">Current format</span></div></div>',
  '<p>Professional invoices and supplier bills using your saved legal business details.</p>',
  '<div class="billing-template-state"><strong>Billing identity configured</strong></div>',
  '<div class="billing-template-buttons"><a class="billing-primary" href="/dashboard/billing/new?kind=sales_invoice">New invoice</a>',
  '<a class="billing-secondary" href="#profile">Billing settings</a></div></div>',
  '<div class="billing-inclusions"><h3>Included in your billing workspace</h3><p>Sales invoices and supplier bills</p></div>',
  '<div class="billing-illustration"><div class="billing-skyline"></div></div></div></section>',
  '<section class="billing-panel billing-register"><div class="billing-panel-heading"><h2>Invoices & Bills</h2></div>',
  '<nav class="billing-tabs"><a class="active" href="#">All documents</a><a href="#">Sales invoices</a>',
  '<a href="#">Purchase bills</a><a href="#">Marketplace incoming</a></nav>',
  '<form class="billing-document-search"><input aria-label="Search billing documents" placeholder="Search invoice, supplier or number…"><button>Search</button></form>',
  '<div class="billing-table-wrap"><table><thead><tr><th>Invoice / Bill</th><th>Party</th>',
  '<th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody><tr>',
  '<td>INV-2026-000001</td><td>Very Long Client Company Name</td><td>17 Oct 2026</td>',
  '<td>₹1,28,54,21,000</td><td>Issued</td><td><a href="#">Open</a></td></tr></tbody></table></div>',
  '<div class="billing-mobile-docs"><a class="billing-mobile-doc" href="/dashboard/billing/one">',
  '<span class="billing-mobile-doc-top"><strong>INV-2026-000001</strong><span class="billing-status billing-status-issued">Issued</span></span>',
  '<span class="billing-mobile-doc-party">Very Long Client Company Name</span>',
  '<span class="billing-mobile-doc-foot"><span>17 Oct 2026</span><strong>₹1,28,54,21,000</strong></span>',
  '</a></div><div class="billing-register-footer">Showing latest invoices</div></section>',
  '<section class="billing-panel billing-tools"><div class="billing-tools-grid">',
  '<a class="billing-tool" href="/dashboard/billing/gst-reports">GST reports</a>',
  '<a class="billing-tool" href="/dashboard/finance/payments">Payments &amp; receipts</a>',
  '<a class="billing-tool" href="/dashboard/finance">Finance overview</a></div></section></div>',
  '<aside class="billing-right"><section class="billing-panel billing-profile" id="profile">',
  '<div class="billing-panel-heading"><h2>Billing Address & GST</h2></div>',
  '<div class="billing-profile-row"><span class="billing-profile-icon"></span><div>',
  '<strong>Construction Company Private Limited</strong>',
  '<p>Registered Office with Long Address, Hyderabad, Telangana, India</p></div></div>',
  '<details class="billing-profile-edit" id="billing-profile-edit"><summary>Edit billing identity</summary>',
  '<p>Frozen on issued invoices</p><div class="billing-form-grid">',
  '<label>GSTIN <input class="billing-field" value="36ABCDE1234F1Z5"></label>',
  '</div></details></section>',
  '<section class="billing-panel billing-quick"><h2>Quick actions</h2><a href="/dashboard/billing/new">Create invoice</a></section>',
  '<section class="billing-panel billing-activity"><h2>Recent documents</h2>',
  '<a class="billing-activity-item" href="#"><span class="billing-activity-info"><strong>Customer</strong></span></a>',
  '</section></aside></div></main></body></html>',
].join('');

test('premium Billing layout never overflows mobile or desktop viewport', async ({page}) => {
  await page.setContent(markup);
  for (const width of [320,360,390,430,600,660,768,1024,1365]) {
    await page.setViewportSize({width,height:840});
    const overflow=await page.evaluate(() => ({
      scroll:document.documentElement.scrollWidth,
      viewport:document.documentElement.clientWidth,
    }));
    expect(overflow.scroll, 'billing horizontal overflow at '+width).toBeLessThanOrEqual(overflow.viewport+1);
    const header=await page.locator('.billing-heading').boundingBox();
    const stats=await page.locator('.billing-stats').boundingBox();
    expect(header).not.toBeNull();
    expect(stats).not.toBeNull();
    expect(stats!.y).toBeGreaterThanOrEqual(header!.y+header!.height-1);
    if (width <= 660) {
      await expect(page.locator('.billing-mobile-doc')).toBeVisible();
      await expect(page.locator('.billing-table-wrap')).toBeHidden();
    } else {
      await expect(page.locator('.billing-table-wrap')).toBeVisible();
      await expect(page.locator('.billing-mobile-doc')).toBeHidden();
    }
  }
});

test('mobile billing exposes invoice links and editable GST identity without overlapping actions', async ({page}) => {
  await page.setViewportSize({width:360,height:820});
  await page.setContent(markup);
  await expect(page.getByRole('link',{name:'New invoice'})).toHaveAttribute('href',
    '/dashboard/billing/new?kind=sales_invoice');
  const register=page.locator('.billing-register');
  const profile=page.locator('.billing-profile');
  const doc=page.locator('.billing-mobile-doc');
  for (const el of [register,profile,doc]) {
    const box=await el.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x+box!.width).toBeLessThanOrEqual(361);
  }
  const details=page.locator('#billing-profile-edit');
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open');
  await expect(details.locator('input')).toBeVisible();
});
