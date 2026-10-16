import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

/**
 * Branded, browser-independent A4 quotation. This is the safety net for
 * Hostinger instances without Chromium; it must never degrade to a plain
 * text dump. Input is the already validated, customer-facing saved snapshot.
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
  logoDataUri?: string;
  coverImageDataUri?: string;
  items: ReadonlyArray<{
    heading: string;
    price?: string;
    details: readonly string[];
  }>;
  terms: string;
  notes: string;
  termSections?: ReadonlyArray<{ title: string; text: string }>;
  paymentSchedule?: ReadonlyArray<{ name: string; percent: number; amount: string }>;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 43;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const white = rgb(1, 1, 1);
const navy = rgb(0.075, 0.13, 0.215);
const ink = rgb(0.125, 0.19, 0.28);
const muted = rgb(0.43, 0.49, 0.57);
const pale = rgb(0.963, 0.973, 0.987);
const lineColor = rgb(0.88, 0.91, 0.945);

function pdfSafe(value: string) {
  return value.normalize('NFKD')
    .replace(/\u20b9/g, 'INR ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7e\n]/g, '?');
}

function colorFromHex(value: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : 'fa711c';
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function fitted(value: string, font: PDFFont, size: number, width: number) {
  const safe = pdfSafe(value);
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let result = safe;
  while (result.length > 1 &&
    font.widthOfTextAtSize(result + '...', size) > width) result = result.slice(0, -1);
  return result + '...';
}

/** Accept only an embedded, bounded image from the validated branding data. */
async function embeddedImage(doc: PDFDocument, value?: string) {
  if (!value || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) ||
    value.length > 180000) return null;
  try {
    const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
    return value.startsWith('data:image/png;')
      ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    // A missing or historically corrupt optional logo must not lose the quote.
    return null;
  }
}

export async function renderQuotationFallbackPdf(
  input: QuotationPdfFallbackInput,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = colorFromHex(input.accent);
  const logo = await embeddedImage(doc, input.logoDataUri);
  const coverImage = await embeddedImage(doc, input.coverImageDataUri);
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 110;
  let pageIndex = 0;

  const fittedText = (
    content: string, x: number, baseline: number, size: number,
    font: PDFFont, color = ink, available = PAGE_W - x - MARGIN,
  ) => page.drawText(fitted(content, font, size, available), {
    x, y: baseline, font, size, color,
  });

  const drawLogo = (x: number, top: number, boxWidth: number, boxHeight: number) => {
    if (!logo) return;
    const fittedImage = logo.scaleToFit(boxWidth, boxHeight);
    page.drawImage(logo, {
      x: x + (boxWidth - fittedImage.width) / 2,
      y: top - boxHeight + (boxHeight - fittedImage.height) / 2,
      width: fittedImage.width,
      height: fittedImage.height,
    });
  };

  // A designed front page, not an unstyled invoice-style text list.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: navy });
  page.drawRectangle({ x: 0, y: PAGE_H - 12, width: PAGE_W, height: 12, color: accent });
  page.drawRectangle({ x: PAGE_W - 175, y: 224, width: 175, height: 420,
    color: rgb(0.105, 0.185, 0.29) });
  page.drawRectangle({ x: PAGE_W - 90, y: 286, width: 90, height: 284,
    color: rgb(0.145, 0.225, 0.33) });
  if (coverImage) {
    const crop = coverImage.scaleToFit(248, 260);
    page.drawImage(coverImage, {
      x: PAGE_W - 42 - crop.width,
      y: 339 + (260 - crop.height) / 2,
      width: crop.width,
      height: crop.height,
    });
  }
  if (logo) {
    page.drawRectangle({ x: MARGIN, y: PAGE_H - 129, width: 65, height: 65, color: white });
    drawLogo(MARGIN + 5, PAGE_H - 69, 55, 55);
  }
  fittedText(input.company, logo ? 122 : MARGIN, PAGE_H - 98, 17, bold, white,
    logo ? 365 : 470);
  fittedText(input.companyAddress, MARGIN, PAGE_H - 158, 10, regular, rgb(0.77, 0.83, 0.9), 455);
  page.drawRectangle({ x: MARGIN, y: PAGE_H - 252, width: 56, height: 4, color: accent });
  fittedText('YOUR PROJECT. OUR COMMITMENT.', MARGIN, PAGE_H - 235, 10, bold,
    rgb(0.82, 0.86, 0.92), 455);
  fittedText('CONSTRUCTION', MARGIN, PAGE_H - 317, 33, bold, white, 495);
  fittedText('QUOTATION', MARGIN, PAGE_H - 360, 33, bold, white, 495);
  fittedText(input.project, MARGIN, PAGE_H - 410, 15, regular, rgb(0.84, 0.88, 0.93), 480);
  fittedText(input.site, MARGIN, PAGE_H - 439, 10, regular, rgb(0.77, 0.84, 0.9), 460);
  page.drawRectangle({
    x: MARGIN, y: 138, width: CONTENT_W, height: 142, color: white,
  });
  fittedText('PROPOSAL FOR', MARGIN + 18, 247, 9, bold, muted, 460);
  fittedText(input.customer, MARGIN + 18, 221, 20, bold, ink, 455);
  fittedText('ESTIMATED PROJECT VALUE', MARGIN + 18, 187, 9, bold, muted, 460);
  fittedText(input.currency + ' ' + input.total, MARGIN + 18, 154, 24, bold, accent, 458);
  fittedText('QUOTE  ' + input.number + '    /    REVISION ' + input.revision,
    MARGIN, 91, 10, bold, white, 500);
  fittedText('VALID UNTIL  ' + input.validUntil, MARGIN, 70, 9, regular,
    rgb(0.81, 0.86, 0.91), 500);

  const startContentPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageIndex++;
    y = PAGE_H - 115;
    page.drawRectangle({ x: 0, y: PAGE_H - 72, width: PAGE_W, height: 72, color: navy });
    page.drawRectangle({ x: 0, y: PAGE_H - 76, width: PAGE_W, height: 4, color: accent });
    if (logo) {
      page.drawRectangle({ x: MARGIN, y: PAGE_H - 64, width: 48, height: 48, color: white });
      drawLogo(MARGIN + 4, PAGE_H - 28, 40, 40);
    }
    fittedText(input.company, logo ? MARGIN + 61 : MARGIN, PAGE_H - 39,
      13, bold, white, logo ? 310 : 367);
    fittedText('QUOTATION  /  R' + input.revision,
      PAGE_W - MARGIN - 127, PAGE_H - 39, 9, bold, white, 127);
  };

  const ensure = (needed = 22) => {
    if (y - needed < 69) startContentPage();
  };
  const write = (
    content: string, size = 10, strong = false, color = ink, indent = 0,
    extraWidth = 0,
  ) => {
    const font = strong ? bold : regular;
    const maxWidth = CONTENT_W - indent - extraWidth;
    const emit = (row: string) => {
      ensure(size * 1.55);
      page.drawText(row, { x: MARGIN + indent, y, size, font, color });
      y -= size * 1.55;
    };
    const paragraphs = pdfSafe(content).split(/\r?\n/);
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      let row = '';
      for (const word of words) {
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          if (row) { emit(row); row = ''; }
          let part = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(part + ch, size) > maxWidth) {
              if (part) emit(part);
              part = ch;
            } else part += ch;
          }
          row = part;
        } else if (font.widthOfTextAtSize(row ? row + ' ' + word : word, size) > maxWidth) {
          emit(row); row = word;
        } else row += (row ? ' ' : '') + word;
      }
      if (row) emit(row);
      if (!words.length) y -= size * 0.9;
    }
  };
  const section = (heading: string, subtitle?: string) => {
    ensure(subtitle ? 87 : 63);
    y -= 8;
    page.drawRectangle({ x: MARGIN, y: y - 27, width: CONTENT_W, height: 37, color: pale });
    page.drawRectangle({ x: MARGIN, y: y - 27, width: 4, height: 37, color: accent });
    fittedText(heading.toUpperCase(), MARGIN + 14, y - 12, 12, bold, navy, CONTENT_W - 28);
    y -= 46;
    if (subtitle) { write(subtitle, 9, false, muted); y -= 9; }
  };
  const rule = () => {
    ensure(13);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
      thickness: 0.7, color: lineColor });
    y -= 13;
  };

  startContentPage();
  section('Quotation overview', 'Prepared from your company-approved, saved quotation.');
  const details = [
    ['PREPARED FOR', input.customer],
    ['CUSTOMER CONTACT', input.customerContact],
    ['PROJECT', input.project],
    ['SITE / LOCATION', input.site],
    ['QUOTE NUMBER', input.number + '  /  Revision ' + input.revision],
    ['VALID UNTIL', input.validUntil],
  ].filter((entry) => entry[1]?.trim());
  for (const [label, value] of details) {
    ensure(39);
    write(label ?? '', 8, true, muted);
    write(value ?? '', 11, true, ink);
    y -= 6;
  }
  section('Work and material estimate', 'Quantities, rates and inclusions specific to this quotation.');
  for (const [index, item] of input.items.entries()) {
    ensure(53);
    // Alternating visual rows keep long floor and material schedules readable.
    page.drawRectangle({
      x: MARGIN, y: y - 34, width: CONTENT_W, height: 49,
      color: index % 2 === 0 ? pale : white,
    });
    page.drawRectangle({ x: MARGIN, y: y - 34, width: 3, height: 49, color: accent });
    fittedText(String(index + 1).padStart(2, '0'), MARGIN + 10, y - 8,
      9, bold, accent, 25);
    fittedText(item.heading, MARGIN + 39, y - 8, 11, bold, ink,
      item.price ? CONTENT_W - 215 : CONTENT_W - 57);
    if (item.price)
      fittedText(input.currency + ' ' + item.price, PAGE_W - MARGIN - 155, y - 8,
        10, bold, accent, 151);
    y -= 51;
    for (const detail of item.details) {
      if (!detail.trim()) continue;
      write(detail, 9, false, muted, 16);
    }
    y -= 7;
    rule();
  }
  ensure(87);
  y -= 3;
  page.drawRectangle({ x: MARGIN, y: y - 60, width: CONTENT_W, height: 67, color: navy });
  fittedText('TOTAL PROJECT ESTIMATE', MARGIN + 15, y - 16, 10, bold, white, 470);
  fittedText(input.currency + ' ' + input.total, MARGIN + 15, y - 46,
    20, bold, white, 470);
  y -= 90;

  // A separate payments and conditions section is always present, even on
  // long quotations that spill onto multiple A4 pages.
  section('Stage-wise payment schedule', 'Proposed milestones; this document is not an invoice.');
  if (input.paymentSchedule?.length) {
    const headerY = y;
    page.drawRectangle({ x: MARGIN, y: headerY - 22, width: CONTENT_W, height: 28, color: navy });
    fittedText('MILESTONE', MARGIN + 10, headerY - 13, 9, bold, white, 288);
    fittedText('SHARE', MARGIN + 322, headerY - 13, 9, bold, white, 65);
    fittedText('AMOUNT', MARGIN + 388, headerY - 13, 9, bold, white, 112);
    y -= 38;
    for (const [i, row] of input.paymentSchedule.entries()) {
      ensure(58);
      page.drawRectangle({ x: MARGIN, y: y - 41, width: CONTENT_W, height: 50,
        color: i % 2 === 0 ? pale : white });
      fittedText(row.name, MARGIN + 10, y - 12, 10, bold, ink, 300);
      fittedText(row.percent.toFixed(2) + '%', MARGIN + 322, y - 12,
        10, regular, muted, 65);
      fittedText(input.currency + ' ' + row.amount, MARGIN + 386, y - 12,
        10, bold, ink, 116);
      y -= 56;
    }
    ensure(42);
    fittedText('TOTAL  /  100%', MARGIN + 9, y - 12, 10, bold, navy, 270);
    fittedText(input.currency + ' ' + input.total, MARGIN + 317, y - 12,
      12, bold, accent, 187);
    y -= 39;
  } else {
    write('No confirmed payment milestones have been saved for this quotation.', 10, false, muted);
    y -= 8;
  }

  section('Terms and inclusions');
  const conditions = input.termSections ??
    (input.terms.trim() ? [{ title: 'Additional terms', text: input.terms }] : []);
  if (conditions.length) {
    for (const item of conditions) {
      if (!item.text.trim()) continue;
      ensure(45);
      write(item.title, 11, true, accent);
      y -= 4;
      for (const paragraph of item.text.split(/\r?\n/)) {
        if (paragraph.trim()) write(paragraph, 9, false, ink, 10);
        else y -= 6;
      }
      y -= 12;
    }
  } else write('No additional quotation conditions have been saved.', 10, false, muted);
  if (input.notes.trim()) {
    section('Project notes');
    write(input.notes, 10, false, ink);
  }
  y -= 16;
  ensure(50);
  write('This document reflects the saved quotation revision. Any changes to the scope, material brands, milestones or prices require an updated quotation.', 9, false, muted);

  doc.getPages().forEach((sheet, index) => {
    if (index === 0) return;
    sheet.drawLine({
      start: { x: MARGIN, y: 52 }, end: { x: PAGE_W - MARGIN, y: 52 },
      thickness: 0.7, color: lineColor,
    });
    sheet.drawText(fitted(input.company + '  |  ' + input.number,
      regular, 8, CONTENT_W - 95), {
      x: MARGIN, y: 35, font: regular, size: 8, color: muted,
    });
    sheet.drawText('PAGE ' + (index + 1) + ' / ' + doc.getPageCount(), {
      x: PAGE_W - MARGIN - 81, y: 35, font: bold, size: 8, color: muted,
    });
  });
  doc.setTitle(pdfSafe(input.number + ' - ' + input.company));
  doc.setAuthor(pdfSafe(input.company));
  doc.setSubject('Branded customer quotation');
  doc.setCreator('Business OS');
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}
