import { afterEach, expect, test, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { chromiumLaunchFailureCategory } from './pdf.node';
import {
  cloudflarePdfRequest,
  configuredPdfProvider,
  PdfServiceError,
  renderPdf,
  renderConstructionPackageSamplePdf,
  validatePrintHtml,
} from './pdf';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('classifies Chromium shared-host failures without including logs or paths', () => {
  expect(
    chromiumLaunchFailureCategory(
      new Error("Executable doesn't exist at /private/path"),
    ),
  ).toBe('missing-binary');
  expect(
    chromiumLaunchFailureCategory(
      new Error('error while loading shared libraries: libnss3.so'),
    ),
  ).toBe('missing-libraries');
  expect(
    chromiumLaunchFailureCategory(new Error('Operation not permitted')),
  ).toBe('execution-blocked');
  expect(
    chromiumLaunchFailureCategory(new Error('ENOMEM cannot allocate memory')),
  ).toBe('resource-exhausted');
  expect(
    chromiumLaunchFailureCategory(
      new Error('browserType.launch: Timeout 15000ms exceeded'),
    ),
  ).toBe('launch-timeout');
  expect(
    chromiumLaunchFailureCategory(new Error('unexpected browser crash')),
  ).toBe('unknown');
});

test('the Node hosting default selects Chromium without guessing a Workers provider', () => {
  expect(configuredPdfProvider({})).toBe('node');
  expect(configuredPdfProvider({ PDF_RENDERER: 'node' })).toBe('node');
  expect(() => configuredPdfProvider({ PDF_RENDERER: 'plain-text' })).toThrow(
    PdfServiceError,
  );
});

test('provisioned Cloudflare Browser Rendering produces the same premium HTML PDF on hosts without Chromium', () => {
  const cloudflare = {
    CF_BROWSER_ACCOUNT_ID: 'a'.repeat(32),
    CF_BROWSER_API_TOKEN: 'token',
  };
  expect(configuredPdfProvider(cloudflare)).toBe('cloudflare-rest');
  expect(configuredPdfProvider({ ...cloudflare, PDF_RENDERER: 'node' })).toBe(
    'node',
  );
  expect(
    configuredPdfProvider({ ...cloudflare, PDF_RENDERER: 'cloudflare-rest' }),
  ).toBe('cloudflare-rest');
});

test('Cloudflare backend requires explicit provisioned account and token', async () => {
  vi.stubEnv('PDF_RENDERER', 'cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', '');
  vi.stubEnv('CF_BROWSER_API_TOKEN', '');
  await expect(
    renderPdf('<!doctype html><html><body>Test</body></html>'),
  ).rejects.toMatchObject({
    code: 'PDF_RENDERER_UNAVAILABLE',
    status: 503,
  });
});

test('Cloudflare REST request disables scripts and blocks remote resource loading', () => {
  const request = cloudflarePdfRequest(
    '<html>approved</html>',
    {},
    {
      CF_BROWSER_ACCOUNT_ID: 'a'.repeat(32),
      CF_BROWSER_API_TOKEN: 'staging-token',
    },
  );
  expect(request.url).toContain('/browser-run/pdf');
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
  const fetchMock = vi.fn(
    async () =>
      new Response(Uint8Array.from(sample).buffer, {
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

test('invalid premium HTML fails with an actionable safe PDF error code', async () => {
  await expect(
    renderPdf('<img src="https://unknown.example/private-image.png">'),
  ).rejects.toMatchObject({
    code: 'PDF_PRINT_HTML_INVALID',
    status: 503,
  });
});

test('when Chromium cannot start, a configured browser PDF service prints identical HTML', async () => {
  vi.stubEnv('PDF_RENDERER', 'node');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', 'c'.repeat(32));
  vi.stubEnv('CF_BROWSER_API_TOKEN', 'secret-test-token');
  const html = '<html><head></head><body><h1>Premium quote</h1></body></html>';
  const nodeRenderer = await import('./pdf.node');
  const chromium = vi
    .spyOn(nodeRenderer, 'renderNodePdf')
    .mockRejectedValueOnce(new Error('PDF_CHROMIUM_UNAVAILABLE'));
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const sample = await doc.save();
  const remote = vi.fn(
    async () =>
      new Response(Uint8Array.from(sample).buffer, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
  );
  vi.stubGlobal('fetch', remote);
  try {
    const result = await renderPdf(html, { title: 'Premium quote' });
    expect(result.toString('ascii', 0, 5)).toBe('%PDF-');
    expect((await PDFDocument.load(result)).getTitle()).toBe('Premium quote');
    expect(chromium).toHaveBeenCalledOnce();
    expect(remote).toHaveBeenCalledOnce();
  } finally {
    chromium.mockRestore();
  }
});

test('a Cloudflare provider failure fails closed, never returns a text-only PDF', async () => {
  vi.stubEnv('PDF_RENDERER', 'cloudflare-rest');
  vi.stubEnv('CF_BROWSER_ACCOUNT_ID', 'b'.repeat(32));
  vi.stubEnv('CF_BROWSER_API_TOKEN', 'staging-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Forbidden', { status: 403 })),
  );
  await expect(renderPdf('<p>Private document</p>')).rejects.toMatchObject({
    code: 'PDF_RENDER_FAILED',
    status: 503,
  });
});

test('embedded media and links are safe but active content and remote fetches fail closed', () => {
  expect(
    validatePrintHtml(
      '<html><head></head><body><a href="https://example.com/contact">Contact</a><img src="data:image/png;base64,aGVsbG8="></body></html>',
    ),
  ).toContain('Content-Security-Policy');
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

test('package PDF preview is a valid multi-page A4 document without Chromium', async () => {
  const document = await renderConstructionPackageSamplePdf({
    company: 'SG Homes',
    name: 'Royal Construction',
    code: 'ROYAL',
    description: 'Construction estimate with all standard inclusions.',
    ratePerSqft: '1950',
    themeColor: '#155EEF',
    sections: Array.from({ length: 17 }, (_, index) => ({
      title: 'Material specification ' + (index + 1),
      brand: 'Sample brand',
      grade: 'Grade A',
      description: 'Approved specifications and installation terms. '.repeat(
        15,
      ),
      allowancePerSqft: '85',
    })),
  });
  expect(document.toString('ascii', 0, 5)).toBe('%PDF-');
  const pdf = await PDFDocument.load(document);
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.getPages()[0]?.getSize()).toMatchObject({
    width: 595,
    height: 842,
  });
  expect(pdf.getTitle()).toContain('Royal Construction');
});
