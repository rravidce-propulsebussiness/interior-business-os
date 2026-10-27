import { chromium, type Browser } from 'playwright';
import { existsSync } from 'node:fs';
import type { PdfOptions } from './pdf';

/** Stable, sanitized diagnosis. Never print Chromium stderr, local paths or env values. */
export function chromiumLaunchFailureCategory(
  error: unknown,
):
  | 'missing-binary'
  | 'missing-libraries'
  | 'execution-blocked'
  | 'resource-exhausted'
  | 'launch-timeout'
  | 'unknown' {
  const detail = error instanceof Error ? error.message : '';
  if (
    /error while loading shared libraries|cannot open shared object|host system is missing dependencies|lib(?:nss|atk|X11|gbm|asound|drm|cups)/i.test(
      detail,
    )
  )
    return 'missing-libraries';
  if (
    /executable doesn't exist|executable not found|enoent|please run .*playwright install/i.test(
      detail,
    )
  )
    return 'missing-binary';
  if (
    /permission denied|eacces|operation not permitted|no usable sandbox|seccomp|failed to move to new namespace|read.only file system/i.test(
      detail,
    )
  )
    return 'execution-blocked';
  if (
    /out of memory|cannot allocate memory|ENOMEM|resource temporarily unavailable|EAGAIN/i.test(
      detail,
    )
  )
    return 'resource-exhausted';
  if (/timed out|timeout/i.test(detail)) return 'launch-timeout';
  return 'unknown';
}

/** A Node-only adapter. Never launch Chromium from a Cloudflare Worker. */
export async function renderNodePdf(
  html: string,
  options: PdfOptions,
): Promise<Buffer> {
  const args = [
    '--disable-background-networking',
    '--no-first-run',
    '--disable-extensions',
    '--disable-dev-shm-usage',
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
          headless: true,
          timeout: 15_000,
          args,
          executablePath,
        });
        recovered = true;
        break;
      } catch {
        /* Try the next explicitly known local binary. */
      }
    }
    if (!recovered) {
      // Never log or expose filesystem paths and process environment details.
      // The upstream PDF router maps this stable code to a safe actionable error.
      console.error('premium.pdf.chromium_launch_failed', {
        reason: chromiumLaunchFailureCategory(initialError),
        playwrightBundleConfigured: Boolean(
          process.env.PLAYWRIGHT_BROWSERS_PATH,
        ),
        systemChromiumAttempted: systemPaths.some((executablePath) =>
          existsSync(executablePath),
        ),
      });
      throw new Error('PDF_CHROMIUM_UNAVAILABLE', { cause: initialError });
    }
  }
  if (!browser) throw new Error('PDF_CHROMIUM_UNAVAILABLE');
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
