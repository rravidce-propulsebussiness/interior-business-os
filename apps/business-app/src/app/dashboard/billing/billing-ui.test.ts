import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./billing-premium.css', import.meta.url), 'utf8');
const actions = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');

describe('premium tenant GST billing dashboard', () => {
  it('loads only the authenticated organization billing data', () => {
    expect(page).toContain("requirePermission(context.organizationId,'invoice.view')");
    expect(page).toContain('gst.profile(context.organizationId)');
    expect(page).toContain("gst.list(context.organizationId,'all')");
    expect(page).toContain('createGstTemplatesRepository(client).standard(context.organizationId)');
    expect(page).toContain("canCreate=grants.has('invoice.create')");
    expect(page).toContain("canManage=grants.has('billing.manage')");
    expect(page).not.toContain('Business Growth');
    expect(page).not.toContain('4242');
    expect(page).not.toContain('Auto-pay is enabled');
  });

  it('filters actual documents by type, date and search, without fabricated payments', () => {
    expect(page).toContain('const kind:Kind=');
    expect(page).toContain('const period:Period=');
    expect(page).toContain('const cutoff=periodStart(period)');
    expect(page).toContain("const inPeriod=allDocs.filter(keepDate)");
    expect(page).toContain('const docs=selectedDocs.filter(');
    expect(page).toContain("d.kind==='sales_invoice'&&d.status==='issued'");
    expect(page).toContain("d.kind==='purchase_bill'&&d.status==='recorded'");
    expect(page).toContain('gst.list(context.organizationId,kind)');
    expect(page).toContain('Showing {docs.length} of the latest 100 documents');
  });

  it('keeps existing invoice actions, GST profile save, and finance navigation', () => {
    expect(page).toContain('href="/dashboard/billing/new?kind=sales_invoice"');
    expect(page).toContain('href="/dashboard/billing/new?kind=purchase_bill"');
    expect(page).toContain('href="/dashboard/billing/gst-reports"');
    expect(page).toContain("href={'/dashboard/billing/'+d.id}");
    expect(page).toContain('action={saveGstProfile}');
    expect(page).toContain('<BillingProfileEditButton/>');
    expect(page).toContain('billing-coverage');
    expect(page).toContain('name="legalName"');
    expect(page).toContain('name="gstin"');
    expect(actions).toContain("authorization.requirePermission(org, 'billing.manage')");
    expect(page).toContain('canPayments&&<Link href="/dashboard/finance/payment_methods"');
  });

  it('matches the premium image layout with responsive and accessible mobile billing', () => {
    for (const fragment of ['billing-stats','billing-layout','billing-template',
      'billing-register','billing-profile','billing-quick','billing-activity',
      'billing-tools','billing-mobile-docs']) {
      expect(page).toContain(fragment);
      expect(css).toContain('.'+fragment);
    }
    expect(css).toContain('@media(max-width:660px)');
    expect(css).toContain('grid-template-columns:repeat(4,minmax(0,1fr))');
    expect(css).toContain('.billing-table-wrap{display:none;}');
    expect(page).toContain('aria-label="Billing date range"');
    expect(page).toContain('aria-label="Search billing documents"');
  });
});
