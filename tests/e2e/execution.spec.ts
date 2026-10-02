import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { renderExecutionDocument } from '../../packages/core/src/execution-document';
import { executionDocumentFixture } from '../../packages/core/src/execution-document.fixture';
import { renderQuotationPdf } from '../../apps/business-app/src/app/dashboard/quotations/pdf-renderer';
test('execution workflows and cost documents reject anonymous access', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  for (const path of [
    '',
    '/execution_estimate_revisions',
    '/materials',
    '/vendors',
    '/rfqs',
    '/purchase_orders',
    '/goods_receipts',
    '/costs',
  ]) {
    await page.goto('/dashboard/execution' + path);
    await expect(page).toHaveURL(/\/login$/);
  }
  for (const entity of [
    'execution_estimate_line_costs',
    'material_cost_revisions',
    'vendor_quotes',
    'purchase_order_item_costs',
  ]) {
    const response = await request.get('/api/execution/' + entity);
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.text()).not.toMatch(
      /unit_price|unit_cost|rate_snapshot|document_snapshot/,
    );
  }
  for (const entity of [
    'execution_estimate_revisions',
    'rfqs',
    'purchase_orders',
    'goods_receipts',
  ]) {
    const response = await request.get(
      `/dashboard/execution/${entity}/00000000-0000-4000-8000-000000000001/pdf`,
    );
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
test('execution PDFs render single and multiple pages with safe projections', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  test.setTimeout(120000);
  for (const kind of [
    'rfq',
    'purchase_order',
    'goods_receipt',
    'execution_estimate',
  ] as const) {
    const fixture = executionDocumentFixture(
        kind,
        kind === 'purchase_order'
          ? 40
          : kind === 'execution_estimate'
            ? 24
            : kind === 'rfq'
              ? 12
              : 2,
      ),
      html = renderExecutionDocument(fixture);
    await page.setContent(html);
    await expect(
      page.getByRole('heading', { name: 'Studio North Interiors' }),
    ).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(
      /rate_snapshot|internal_margin|request_hash/,
    );
    const pdf = await renderQuotationPdf(html);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10000);
    await writeFile(info.outputPath(`${kind}.pdf`), pdf);
  }
});
