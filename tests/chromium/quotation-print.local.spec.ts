import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { renderQuotationDocument } from '../../packages/core/src/quotation-document';
import { quotationDocumentFixture } from '../../packages/core/src/quotation-document.fixture';

test('premium quotation is a complete multi-page A4 PDF with a cover and closing page', async ({ page }) => {
  const document = quotationDocumentFixture();
  document.header.branding.accent = '#f5650b';
  const html = renderQuotationDocument(document);
  await page.setContent(html, { waitUntil: 'load' });
  await expect(page.locator('.pb-cover')).toBeVisible();
  await expect(page.locator('.pb-close')).toBeAttached();
  await expect(page.locator('.pb-title')).toContainText(document.number);
  const pdfBytes = await page.pdf({
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(Buffer.from(pdfBytes).toString('ascii', 0, 5)).toBe('%PDF-');
  const pdf = await PDFDocument.load(pdfBytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
  const first = pdf.getPage(0).getSize();
  expect(first.width).toBeGreaterThan(594);
  expect(first.width).toBeLessThan(596);
  expect(first.height).toBeGreaterThan(841);
  expect(first.height).toBeLessThan(843);
});
