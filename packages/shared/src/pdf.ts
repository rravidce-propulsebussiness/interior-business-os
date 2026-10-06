export interface PdfOptions {
  brochure?: boolean;
  title?: string;
  author?: string;
  subject?: string;
}

/**
 * Chromium PDF generation is intentionally unavailable in the Cloudflare
 * Worker runtime. Keeping this module free of Playwright/native dependencies
 * allows the rest of Business OS to deploy and run at the edge.
 *
 * Published brochure PDFs already stored by the application remain readable.
 * A dedicated Browser Rendering worker can be wired here later without
 * changing callers.
 */
export async function renderPdf(_html: string, _options: PdfOptions = {}) {
  throw new Error(
    'PDF_RENDERER_UNAVAILABLE: PDF generation is not enabled on this Cloudflare staging runtime.',
  );
}
