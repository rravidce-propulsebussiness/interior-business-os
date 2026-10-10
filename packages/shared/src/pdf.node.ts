import { chromium } from 'playwright';
import type { PdfOptions } from './pdf';

/** A Node-only adapter. Never launch Chromium from a Cloudflare Worker. */
export async function renderNodePdf(
  html: string,
  options: PdfOptions,
): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    timeout: 15_000,
    args: [
      '--disable-background-networking',
      '--no-first-run',
      '--disable-extensions',
    ],
  });
  // Hard stop if the renderer hangs. Closing the browser fails the job closed.
  const watchdog = setTimeout(() => {
    void browser.close().catch(() => {});
  }, 30_000);
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    try {
      // This blocks all HTTP(S)/file resources, regardless of an HTML/CSS bug.
      await context.route('**/*', async (route) => {
        await route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
      await page.emulateMedia({ media: 'print' });

      // Deliberately reject overflowing brochure components, never auto-shrink
      // important copy or silently cut off pricing/legal terms.
      if (options.brochure) {
        const overflow = await page
          .locator('.brochure-component')
          .evaluateAll((components) =>
            components.some((component) => {
              if (
                !component.querySelector(
                  '.brochure-text, .brochure-subtitle, table, ol',
                )
              )
                return false;
              return (
                component.scrollHeight > component.clientHeight + 2 ||
                component.scrollWidth > component.clientWidth + 2
              );
            }),
          );
        if (overflow)
          throw new Error(
            'Print preflight: brochure content overflows a component',
          );
      }

      const bytes = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
        timeout: 30_000,
      });
      return Buffer.from(bytes);
    } finally {
      await context.close();
    }
  } finally {
    clearTimeout(watchdog);
    await browser.close().catch(() => {});
  }
}
