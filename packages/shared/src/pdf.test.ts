import { afterEach, expect, test, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  cloudflarePdfRequest,
  configuredPdfProvider,
  PdfServiceError,
  renderPdf,
  validatePrintHtml,
} from './pdf';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('the Node hosting default selects Chromium without guessing a Workers provider', () => {
  expect(configuredPdfProvider({})).toBe('node');
  expect(configuredPdfProvider({ PDF_RENDERER: 'node' })).toBe('node');
  expect(() =>
    configuredPdfProvider({ PDF_RENDERER: 'plain-text' }),
  ).toThrow(PdfServiceError);
});

test('Cloudflare backend requires explicit provisioned account and token', async () => {
  vi.stubEnv('PDF_RENDERER', 'cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', '');
  vi.stubEnv('CF_BROWSER_API_TOKEN', '');
  await expect(renderPdf('<!doctype html><html><body>Test</body></html>')).rejects.toMatchObject({
    code: 'PDF_RENDERER_UNAVAILABLE',
    status: 503,
  });
});

test('Cloudflare REST request disables scripts and blocks remote resource loading', () => {
  const request = cloudflarePdfRequest('<html>approved</html>', {}, {
    CF_BROWSER_ACCOUNT_ID: 'a'.repeat(32),
    CF_BROWSER_API_TOKEN: 'staging-token',
  });
  expect(request.url).toContain('/browser-rendering/pdf');
  expect(request.body.setJavaScriptEnabled).toBe(false);
  expect(request.body.rejectRequestPattern).toContain('^https?://');
  expect(request.body.pdfOptions.preferCSSPageSize).toBe(true);
  expect(request.body.pdfOptions.printBackground).toBe(true);
  expect(request.body.html).toBe('<html>approved</html>');
});

test('Cloudflare REST adapter accepts only PDF bytes from an explicit provider', async () => {
  vi.stubEnv('PDF_RENDERER', 'cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', 'b'.repeat(32));
  vi.stubEnv('CF_BROWSER_API_TOKEN', 'staging-token');
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const sample = await doc.save();
  const fetchMock = vi.fn(async () =>
    new Response(sample, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const bytes = await renderPdf('<html><head></head><body>Safe</body></html>', {
    title: 'Test brochure',
  });
  expect(bytes.toString('ascii', 0, 5)).toBe('%PDF-');
  expect((await PDFDocument.load(bytes)).getTitle()).toBe('Test brochure');
  expect(fetchMock).toHaveBeenCalledOnce();
  const request = fetchMock.mock.calls[0];
  expect(request).toBeDefined();
});

test('a Cloudflare provider failure fails closed, never returns a text-only PDF', async () => {
  vi.stubEnv('PDF_RENDERER', 'cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', 'b'.repeat(32));
  vi.stubEnv('CF_BROWSER_API_TOKEN', 'staging-token');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));
  await expect(renderPdf('<p>Private document</p>')).rejects.toMatchObject({
    code: 'PDF_RENDER_FAILED',
    status: 503,
  });
});

test('embedded media and links are safe but active content and remote fetches fail closed', () => {
  expect(validatePrintHtml('<html><head></head><body><a href="https://example.com/contact">Contact</a><img src="data:image/png;base64,aGVsbG8="></body></html>')).toContain('Content-Security-Policy');
  for (const unsafe of [
    '<script>alert(1)</script>',
    '<iframe src="https://evil.test"></iframe>',
    '<img src="https://evil.test/image.jpg">',
    '<a href="javascript:alert(1)">bad</a>',
    '<style>@import "https://evil.test/style.css";</style>',
    '<div style="background:url(https://evil.test/image.png)">bad</div>',
  ]) {
    expect(() => validatePrintHtml(unsafe)).toThrow();
  }
});
