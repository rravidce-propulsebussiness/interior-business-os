import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { renderFinanceDocument } from '../../packages/core/src/finance-document';
import { financeDocumentFixture } from '../../packages/core/src/finance-document.fixture';
import { renderQuotationPdf } from '../../apps/business-app/src/app/dashboard/quotations/pdf-renderer';
test('finance pages, APIs and PDFs reject anonymous access', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  for (const route of [
    '',
    '/contracts',
    '/invoices',
    '/payments',
    '/change_orders',
    '/payment_schedules',
    '/receipts',
  ]) {
    await page.goto('/dashboard/finance' + route);
    await expect(page).toHaveURL(/\/login$/);
  }
  for (const entity of [
    'contracts',
    'invoices',
    'payments',
    'payment_allocations',
    'receipts',
    'change_orders',
  ]) {
    const response = await request.get('/api/finance/' + entity);
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.text()).not.toMatch(
      /original_contract_value|payment_instructions|request_hash/,
    );
  }
  for (const entity of ['invoices', 'receipts', 'change_orders']) {
    const response = await request.get(
      `/dashboard/finance/${entity}/00000000-0000-4000-8000-000000000001/pdf`,
    );
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
test('commercial PDFs render long A4 documents and historical receipts', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  test.setTimeout(120000);
  for (const kind of [
    'tax_invoice',
    'proforma',
    'receipt',
    'change_order',
    'payment_request',
  ] as const) {
    const fixture = financeDocumentFixture(
        kind,
        kind === 'tax_invoice' ? 28 : 3,
      ),
      html = renderFinanceDocument(fixture);
    await page.setContent(html);
    await expect(
      page.getByRole('heading', { name: 'Studio North Interiors' }),
    ).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(
      /internal_cost|margin|audit_metadata/,
    );
    const pdf = await renderQuotationPdf(html);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10000);
    await writeFile(info.outputPath(`${kind}.pdf`), pdf);
  }
});
