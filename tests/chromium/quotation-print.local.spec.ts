import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { renderQuotationDocument } from '../../packages/core/src/quotation-document';
import { quotationDocumentFixture } from '../../packages/core/src/quotation-document.fixture';
import { renderQuotationPdf } from '../../apps/business-app/src/app/dashboard/quotations/pdf-renderer';

test('premium quotation is a complete multi-page A4 PDF with a cover and closing page', async ({
  page,
}) => {
  const quotation = quotationDocumentFixture();
  quotation.header.branding.accent = '#f5650b';
  const html = renderQuotationDocument(quotation);
  // A deterministic browser test should not depend on Unsplash availability.
  // Tenant-uploaded photos remain data: URLs in real quotation snapshots.
  await page.route('https://images.unsplash.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#17314c"/></svg>',
    });
  });
  await page.setContent(html, { waitUntil: 'load' });
  await expect(page.locator('.pb-cover')).toBeVisible();
  await expect(page.locator('.pb-end')).toBeAttached();
  await expect(page.locator('.pb-pricing')).toBeVisible();
  await expect(page.locator('.pb-specs-page')).toBeAttached();
  await expect(page.locator('.pb-payment-page')).toBeAttached();
  await expect(page.locator('.pb-cover-number')).toContainText(
    quotation.number,
  );
  await expect(page.locator('.pb-estimate')).toBeVisible();
  await expect(page.locator('.pb-intro-card')).toHaveCount(2);
  await expect(page.locator('.pb-material-hero')).toBeVisible();
  const pdfBytes = await page.pdf({
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(Buffer.from(pdfBytes).toString('ascii', 0, 5)).toBe('%PDF-');
  const pdf = await PDFDocument.load(pdfBytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
  const first = pdf.getPage(0).getSize();
  expect(first.width).toBeGreaterThan(594);
  expect(first.width).toBeLessThan(596);
  expect(first.height).toBeGreaterThan(841);
  expect(first.height).toBeLessThan(843);
  await page.setViewportSize({ width: 390, height: 844 });
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageWidths: Array.from(
      document.querySelectorAll('.pb-cover,.pb-page,.pb-end'),
    ).map((element) => element.getBoundingClientRect().width),
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.pageWidths.length).toBeGreaterThanOrEqual(4);
  for (const width of metrics.pageWidths) {
    expect(width).toBeGreaterThan(300);
    expect(width).toBeLessThanOrEqual(metrics.viewport);
  }
});

test('production quotation PDF is generated from the same premium brochure HTML as Preview', async () => {
  const quotation = quotationDocumentFixture();
  quotation.header.branding.accent = '#f5650b';
  const html = renderQuotationDocument(quotation);
  const pdfBytes = await renderQuotationPdf(html, quotation);
  expect(pdfBytes.toString('ascii', 0, 5)).toBe('%PDF-');
  const pdf = await PDFDocument.load(pdfBytes);
  // The premium HTML always has cover, work, specifications, payment/terms
  // and closing sections; the former fallback had an unrelated page design.
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
  expect(pdf.getTitle()).toContain(quotation.number);
  expect(pdf.getAuthor()).toContain(quotation.header.branding.name);
  const first = pdf.getPage(0).getSize();
  expect(first.width).toBeGreaterThan(594);
  expect(first.height).toBeGreaterThan(841);
});
