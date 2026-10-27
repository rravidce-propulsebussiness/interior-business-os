import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(
    process.cwd(),
    'apps/business-app/src/app/dashboard/quotations/quotations-list.css',
  ),
  'utf8',
);

const fixture = [
  '<!doctype html><html lang="en"><head>',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}[hidden]{display:none!important}',
  css,
  '</style></head><body>',
  '<div class="qs-layout"><main class="qs-main"><div class="qs-quotes-page">',
  '<section class="qs-quotes-mobile-list"><section class="qs-quotes-customer-card">',
  '<header class="qs-quotes-customer-header"><span class="qs-quotes-initials">R</span>',
  '<div class="qs-quotes-customer-name"><strong>Ramya</strong><small>2 quotations</small></div></header>',
  '<article class="qs-quotes-mobile-quote">',
  '<div class="qs-quotes-mobile-top"><a href="#">Q-2026-000013</a></div>',
  '<div class="qs-quotes-mobile-meta"><span class="qs-quotes-service">Construction</span>',
  '<strong class="qs-quotes-amount">₹59,20,000</strong></div>',
  '<div class="qs-quotes-mobile-subline"><span>Construction project</span><span>16 Oct 2026 · R1</span></div>',
  '<div class="qs-quotes-mobile-actions">',
  '<a class="qs-quotes-action qs-quotes-action-view" href="#">View</a>',
  '<a class="qs-quotes-action qs-quote-edit" href="#">Edit</a>',
  '<button class="qs-quotes-action qs-quotes-more-trigger" aria-expanded="false" type="button">More</button>',
  '<div class="qs-quotes-mobile-more-panel" hidden>',
  '<a href="#">Download PDF</a><button type="button" class="qs-btn">Delete</button></div></div></article>',
  '<div class="qs-quotes-footer-block"><div class="qs-quotes-mobile-card-footer">',
  '<button class="qs-quotes-history-toggle" type="button">View all quotations (2)</button>',
  '<a class="qs-quotes-mobile-pdf" href="#">View PDF</a></div>',
  '<div class="qs-quotes-past-list qs-quotes-mobile-expanded" hidden>',
  '<article class="qs-quotes-mobile-quote"><a href="#">Previous quotation</a></article>',
  '</div></div></section></section></div></main></div>',
  '<script>',
  "document.querySelector('.qs-quotes-more-trigger').addEventListener('click', e => {",
  "const button=e.currentTarget; const open=button.getAttribute('aria-expanded')!=='true';",
  "button.setAttribute('aria-expanded',String(open));",
  "document.querySelector('.qs-quotes-mobile-more-panel').hidden=!open;});",
  "document.querySelector('.qs-quotes-history-toggle').addEventListener('click', () => {",
  "const panel=document.querySelector('.qs-quotes-past-list'); panel.hidden=!panel.hidden;});",
  '</script></body></html>',
].join('');

test('Quotation actions remain 49px tall and never overlap PDF or history at mobile widths', async ({
  page,
}) => {
  await page.setContent(fixture, { waitUntil: 'load' });
  for (const width of [320, 360, 390, 430, 700]) {
    await page.setViewportSize({ width, height: 844 });
    const buttons = page.locator(
      '.qs-quotes-mobile-actions > .qs-quotes-action',
    );
    await expect(buttons).toHaveCount(3);
    const before = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right,
        };
      }),
    );
    for (const item of before) {
      expect(item.height).toBeGreaterThanOrEqual(44);
      expect(item.height).toBeLessThanOrEqual(52);
      expect(item.width).toBeGreaterThan(60);
      expect(item.right).toBeLessThanOrEqual(width + 1);
    }
    expect(Math.abs(before[0]!.height - before[1]!.height)).toBeLessThan(1);
    expect(before[2]!.width).toBeGreaterThan(before[0]!.width);
    expect(before[0]!.bottom).toBeLessThanOrEqual(before[2]!.y);
    expect(before[1]!.bottom).toBeLessThanOrEqual(before[2]!.y);
    const footer = await page.locator('.qs-quotes-footer-block').boundingBox();
    expect(footer).not.toBeNull();
    expect(before[2]!.bottom).toBeLessThan(footer?.y ?? 0);
    await buttons.nth(2).click();
    await expect(page.locator('.qs-quotes-mobile-more-panel')).toBeVisible();
    const after = await buttons.evaluateAll((elements) =>
      elements.map((e) => e.getBoundingClientRect().height),
    );
    expect(after.every((h) => h <= 52)).toBe(true);
    const menu = await page
      .locator('.qs-quotes-mobile-more-panel')
      .boundingBox();
    const pdf = await page.locator('.qs-quotes-mobile-pdf').boundingBox();
    expect(menu).not.toBeNull();
    expect(pdf).not.toBeNull();
    const expandedMore = await buttons.nth(2).boundingBox();
    expect(expandedMore).not.toBeNull();
    expect(menu!.y).toBeGreaterThanOrEqual(
      expandedMore!.y + expandedMore!.height - 1,
    );
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(pdf!.y + 1);
    const overflow = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(overflow.content).toBeLessThanOrEqual(overflow.viewport + 1);
    await buttons.nth(2).click();
    await expect(page.locator('.qs-quotes-mobile-more-panel')).toBeHidden();
  }
  await page.locator('.qs-quotes-history-toggle').click();
  await expect(page.locator('.qs-quotes-mobile-expanded')).toBeVisible();
});
