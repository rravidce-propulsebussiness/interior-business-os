import { renderQuotationPdf } from '../../apps/business-app/src/app/dashboard/quotations/pdf-renderer';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { renderQuotationDocument } from '../../packages/core/src/quotation-document';
import { quotationDocumentFixture } from '../../packages/core/src/quotation-document.fixture';
test('commercial pages and customer documents require authentication', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  for (const path of [
    'customers',
    'projects',
    'quotations',
    'quotations/settings',
    'quotations/00000000-0000-4000-8000-000000000001',
  ]) {
    await page.goto(`/dashboard/${path}`);
    await expect(page).toHaveURL(/\/login$/);
  }
  for (const format of ['preview', 'pdf']) {
    const response = await page.request.get(
      `/dashboard/quotations/00000000-0000-4000-8000-000000000001/${format}`,
    );
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.text()).not.toContain('133280');
  }
});
test('customer document renders and prints multiple A4 pages', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  test.setTimeout(60000);
  const sample = quotationDocumentFixture(24);
  sample.lines[0]!.specifications.push({
    label: 'Detailed specification',
    value:
      'Factory-finished panels with coordinated grain direction, adjustable shelves and concealed fixings. '.repeat(
        9,
      ) + 'END-OF-LONG-SPECIFICATION',
  });
  const html = renderQuotationDocument(sample);
  await page.setContent(html);
  await expect(
    page.getByRole('heading', { name: 'Studio North Interiors' }),
  ).toBeVisible();
  await expect(page.getByText('Wardrobe 24', { exact: true })).toBeVisible();
  const pdf = await renderQuotationPdf(html);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(20000);
  await writeFile(info.outputPath('quotation-multipage.pdf'), pdf);
  await page.screenshot({
    path: info.outputPath('quotation-preview.png'),
    fullPage: true,
  });
  expect(await page.locator('body').innerText()).not.toMatch(
    /estimatedCost|minimum_rate|internal_notes/,
  );
  const first = quotationDocumentFixture();
  const second = structuredClone(first);
  second.revision = 2;
  second.lines[0]!.rate = '2480';
  second.lines[0]!.amount = '138880';
  second.totals = {
    ...second.totals,
    line_subtotal: '138880',
    subtotal: '138880',
    final_amount: '138880',
  };
  await writeFile(
    info.outputPath('quotation-revision-1.pdf'),
    await renderQuotationPdf(renderQuotationDocument(first)),
  );
  await writeFile(
    info.outputPath('quotation-revision-2.pdf'),
    await renderQuotationPdf(renderQuotationDocument(second)),
  );
});
