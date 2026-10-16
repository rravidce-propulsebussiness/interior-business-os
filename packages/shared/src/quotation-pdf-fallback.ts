import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Service-independent, tenant-branded emergency PDF renderer.
 * Receives only validated customer-facing quotation data, never arbitrary HTML.
 * It is used if the configured Chromium/Cloudflare renderer is unavailable.
 */
export type QuotationPdfFallbackInput = {
  company: string;
  companyAddress: string;
  companyContact: string;
  customer: string;
  customerContact: string;
  project: string;
  site: string;
  number: string;
  revision: number;
  validUntil: string;
  currency: string;
  accent: string;
  total: string;
  items: ReadonlyArray<{
    heading: string;
    price?: string;
    details: readonly string[];
  }>;
  terms: string;
  notes: string;
};

export async function renderQuotationFallbackPdf(
  input: QuotationPdfFallbackInput,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 42;
  const contentWidth = width - 2 * margin;
  const hex = /^#[0-9a-f]{6}$/i.test(input.accent) ? input.accent.slice(1) : 'f16a22';
  const numberAt = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const accent = rgb(numberAt(0), numberAt(2), numberAt(4));
  const navy = rgb(0.10, 0.16, 0.25);
  const grey = rgb(0.43, 0.49, 0.57);
  const pale = rgb(0.96, 0.97, 0.98);
  const safe = (value: string): string => value.normalize('NFKD')
    .replace(/\u20b9/g, 'INR ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7e\n]/g, '?');
  let page = doc.addPage([width, height]);
  let y = height - 112;
  let pageNum = 0;
  const top = () => {
    pageNum++;
    page.drawRectangle({ x: 0, y: height - 73, width, height: 73, color: navy });
    page.drawRectangle({ x: 0, y: height - 77, width, height: 4, color: accent });
    page.drawText(safe(input.company).slice(0, 48), {
      x: margin, y: height - 42, font: bold, size: 17, color: rgb(1, 1, 1),
    });
    page.drawText('QUOTATION', {
      x: width - margin - 92, y: height - 41,
      font: bold, size: 10, color: rgb(1, 1, 1),
    });
    page.drawText('Page ' + pageNum + '   |   ' + safe(input.number).slice(0, 28), {
      x: margin, y: 23, font: regular, size: 9, color: grey,
    });
  };
  const newPage = () => {
    page = doc.addPage([width, height]);
    y = height - 112;
    top();
  };
  const ensure = (needed = 24) => { if (y - needed < 55) newPage(); };
  const write = (content: string, size = 10, strong = false, ink = navy, indent = 0) => {
    const font = strong ? bold : regular;
    const maxWidth = contentWidth - indent;
    const words = safe(content).split(/\s+/).filter(Boolean);
    let line = '';
    const draw = (text: string) => {
      ensure(size * 1.6);
      page.drawText(text, { x: margin + indent, y, size, font, color: ink });
      y -= size * 1.58;
    };
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        if (line) { draw(line); line = ''; }
        let segment = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(segment + ch, size) > maxWidth) {
            if (segment) draw(segment);
            segment = ch;
          } else segment += ch;
        }
        line = segment;
      } else if (font.widthOfTextAtSize(line ? line + ' ' + word : word, size) > maxWidth) {
        if (line) draw(line);
        line = word;
      } else line += (line ? ' ' : '') + word;
    }
    if (line) draw(line);
    if (!words.length) y -= size * 1.58;
  };
  const section = (heading: string) => {
    ensure(52);
    y -= 18;
    page.drawRectangle({ x: margin, y: y - 11, width: contentWidth, height: 29, color: pale });
    page.drawRectangle({ x: margin, y: y - 11, width: 4, height: 29, color: accent });
    page.drawText(safe(heading).slice(0, 74), {
      x: margin + 12, y, font: bold, size: 12, color: navy,
    });
    y -= 42;
  };
  top();
  write('Quotation ' + input.number + '  |  Revision ' + input.revision +
    '  |  Valid until ' + input.validUntil, 10, true, accent);
  y -= 13;
  write('PREPARED FOR', 10, true, grey);
  write(input.customer, 20, true);
  if (input.customerContact) write(input.customerContact, 10, false, grey);
  y -= 8;
  write('PROJECT', 10, true, grey);
  write(input.project, 14, true);
  if (input.site) write(input.site, 10, false, grey);
  y -= 10;
  if (input.companyAddress) write('Company: ' + input.companyAddress, 9, false, grey);
  if (input.companyContact) write(input.companyContact, 9, false, grey);

  section('Quotation amount');
  write(input.currency + ' ' + input.total, 23, true, accent);
  section('Work, materials and prices');
  for (const item of input.items) {
    ensure(45);
    const heading = item.heading + (item.price ? '   |   ' + input.currency + ' ' + item.price : '');
    write(heading, 11, true);
    for (const detail of item.details) {
      if (!detail.trim()) continue;
      write(detail, 9, false, grey, 11);
    }
    y -= 8;
  }
  if (input.terms.trim()) {
    section('Terms and payment schedule');
    for (const paragraph of input.terms.split(/\r?\n/)) {
      if (paragraph.trim()) write(paragraph, 9, false, navy);
      else y -= 6;
    }
  }
  if (input.notes.trim()) {
    section('Notes');
    write(input.notes, 9);
  }
  y -= 12;
  ensure(42);
  write('Generated from the saved quotation. Prices and specifications apply to this version only.', 9, false, grey);
  doc.setTitle(input.number + ' - ' + input.company);
  doc.setAuthor(input.company);
  doc.setSubject('Customer quotation');
  doc.setCreator('Business OS');
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}
