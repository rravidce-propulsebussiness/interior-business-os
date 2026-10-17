import { chromium, type Browser } from 'playwright';
import { existsSync } from 'node:fs';
import type { PdfOptions } from './pdf';

/** A Node-only adapter. Never launch Chromium from a Cloudflare Worker. */
export async function renderNodePdf(
  html: string,
  options: PdfOptions,
): Promise<Buffer> {
  const args = [
    '--disable-background-networking',
    '--no-first-run',
    '--disable-extensions',
  ];
  const configured = process.env.CHROMIUM_EXECUTABLE_PATH;
  // Prefer packaged Playwright Chromium, but some managed Node hosts provide a
  // system Chromium/Chrome binary instead. Do not download or execute unknown
  // paths and never downgrade to a remote webpage screenshot.
  const systemPaths = [
    ...(configured ? [configured] : []),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
  ];
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true, timeout: 15_000, args });
  } catch (initialError) {
    let recovered = false;
    for (const executablePath of systemPaths) {
      if (!existsSync(executablePath)) continue;
      try {
        browser = await chromium.launch({
          headless: true, timeout: 15_000, args, executablePath,
        });
        recovered = true;
        break;
      } catch { /* Try the next explicitly known local binary. */ }
    }
    if (!recovered) throw initialError;
  }
  if (!browser) throw new Error('No installed Chromium browser available for PDF rendering');
  const readyBrowser = browser;
  // Hard stop if the renderer hangs. Closing the browser fails the job closed.
  const watchdog = setTimeout(() => {
    void readyBrowser.close().catch(() => {});
  }, 30_000);
  try {
    const context = await readyBrowser.newContext({
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
      });
      return Buffer.from(bytes);
    } finally {
      await context.close();
    }
  } finally {
    clearTimeout(watchdog);
    await readyBrowser.close().catch(() => {});
  }
}
