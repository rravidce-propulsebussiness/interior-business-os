import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

let active = 0;

export interface PdfOptions {
  brochure?: boolean;
  title?: string;
  author?: string;
  subject?: string;
}

function plainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wrap(text: string, maxWidth: number, font: PDFFont, size: number) {
  const output: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      output.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) output.push(line);
        line = word;
      }
    }
    if (line) output.push(line);
  }
  return output;
}

/**
 * Cloudflare-safe PDF renderer.
 *
 * Workers cannot launch Playwright/Chromium. Keep document downloads
 * functional with a clean text-first PDF. A browser-rendered implementation
 * can later be backed by Cloudflare Browser Rendering without blocking the app.
 */
export async function renderPdf(html: string, options: PdfOptions = {}) {
  if (active >= 2) throw new Error('PDF renderer is busy');
  if (Buffer.byteLength(html) > 80000000)
    throw new Error('Document exceeds rendering limit');
  active++;
  try {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 48;
    const fontSize = 10;
    const lineHeight = 14;
    const title = plainText(
      options.title ?? (options.brochure ? 'Brochure' : 'Business OS document'),
    );
    const lines = wrap(
      plainText(html),
      pageWidth - margin * 2,
      font,
      fontSize,
    );

    let page = document.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    if (title) {
      page.drawText(title.slice(0, 120), {
        x: margin,
        y,
        size: 16,
        font: bold,
        color: rgb(0.08, 0.12, 0.18),
      });
      y -= 28;
    }

    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = document.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      if (line)
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0.12, 0.16, 0.22),
        });
      y -= lineHeight;
    }

    document.setTitle(
      options.title ?? (options.brochure ? 'Brochure' : 'Business OS document'),
    );
    document.setAuthor(options.author ?? '');
    document.setSubject(options.subject ?? '');
    document.setCreator('Business OS');
    document.setProducer('Business OS Cloudflare PDF renderer');
    return Buffer.from(await document.save());
  } finally {
    active--;
  }
}
