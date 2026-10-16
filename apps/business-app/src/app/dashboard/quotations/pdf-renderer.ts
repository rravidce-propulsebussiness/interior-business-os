import { renderPdf, renderQuotationFallbackPdf } from '@business-os/shared/pdf';
import type { CustomerDocument } from '@business-os/core/quotation-document';
import { parseSftEstimate } from '@business-os/core/sft-quotation';
import { savedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';
import { customerTermSections } from '@business-os/core/quotation-terms';

const address = (parts: Record<string, string>) =>
  Object.entries(parts)
    .filter(([key, value]) => key !== 'country_code' && Boolean(value))
    .map(([, value]) => value)
    .join(', ');
const number = (value: string) => {
  const parsed = Number(value);
  return Number.isSafeInteger(Math.round(parsed * 100))
    ? parsed.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    : value;
};

/** Derive rupee amounts from the exact saved revision total, not percentages
 * applied to an unsaved estimate. The final stage absorbs rounding pennies. */
export function savedPdfPaymentRows(terms: string, total: string) {
  const plan = savedStagePaymentPlan(terms);
  if (!plan) return [];
  const totalCents=Math.round(Number(total)*100);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) return [];
  let allocated=0;
  return plan.map((row,i)=>{
    const cents=i===plan.length-1
      ?totalCents-allocated :Math.round(totalCents*row.percent/100);
    allocated+=cents;
    return {name:row.name,percent:row.percent,
      amount:number((cents/100).toFixed(2))};
  });
}

/**
 * The browser preview can use explicitly labelled public concept photography,
 * but the secure PDF renderer MUST NOT fetch external URLs.
 * Swap only the two known static Unsplash concept-image sources for a tiny
 * embedded raster. Tenant-uploaded base64 images remain in the branded PDF.
 * The underlying gradients remain visible if a concept photo was not uploaded.
 */
const transparentPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';

export function safeQuotationPrintHtml(html: string): string {
  return html.replace(
    /src=(["'])https:\/\/images\.unsplash\.com\/photo-(?:1756435292384-1bf32eff7baf|1751945965597-71171ec7a458)[^"']*\1/gi,
    'src="' + transparentPng + '"',
  );
}

/**
 * Prefer the full brochure PDF. Hostinger instances without an installed
 * Chromium browser use a real PDF-Lib A4 fallback rather than returning 503.
 * It includes the saved tenant identity, full work breakdown, all recorded
 * material brands/specifications, customer terms and totals.
 */
export async function renderQuotationPdf(html: string, document?: CustomerDocument) {
  try {
    // This is trusted, server-authored quotation HTML. The printer preflight
    // rejects any remote image source, including curated public concept photos.
    // Sanitize those before the preflight or the printer would always fail.
    return await renderPdf(safeQuotationPrintHtml(html));
  } catch {
    // Preflight errors occur BEFORE renderPdf's internal try/catch and are not
    // PdfServiceError. All printer failures must reach the local renderer.
    // Never render raw user-supplied HTML: the fallback takes the validated
    // customer document, not HTML, URLs or arbitrary file sources.
    if (!document) throw new Error('PDF renderer unavailable without a saved quotation');
    const h = document.header;
    const items = document.lines.flatMap((line) => {
      const sft = parseSftEstimate(line.description);
      if (!sft) {
        return [{
          heading: line.name + (line.optional ? ' (optional)' : ''),
          price: number(line.amount),
          details: [
            ...(line.area ? ['Area: ' + line.area] : []),
            ...(line.description ? [line.description] : []),
            ...line.specifications.map(s => s.label + ': ' + s.value),
          ],
        }];
      }
      const workRows = sft.rows.map(row => ({
        heading: row.name,
        price: number(row.amount),
        details: [
          'Measurement: ' + row.areaSqft + ' ' +
            (row.unit === 'running_ft' ? 'RFT' :
              row.unit === 'cubic_ft' ? 'CFT' :
              row.unit === 'piece' ? 'Nos' :
              row.unit === 'lumpsum' ? 'LS' : 'SFT'),
          'Length ' + row.lengthFeet + ' ft' +
            ', Width ' + row.widthFeet + ' ft' +
            (row.heightFeet ? ', Height ' + row.heightFeet + ' ft' : ''),
          'Rate: ' + number(row.ratePerSqft) + '/unit',
        ],
      }));
      const specifications = (sft.sections ?? []).map(section => ({
        heading: section.title,
        details: [
          ...(section.brand ? ['Brand: ' + section.brand] : []),
          ...(section.grade ? ['Grade: ' + section.grade] : []),
          ...(section.allowancePerSqft
            ? ['Material allowance: ' + section.allowancePerSqft + '/SFT'] : []),
          section.description,
        ],
      }));
      const brands = sft.materials.map(material => ({
        heading: material.category,
        details: [material.name, material.specification],
      }));
      return [
        ...(sft.package ? [{
          heading: 'Selected package: ' + sft.package.name,
          details: [sft.package.description, 'Base rate: ' + number(sft.package.ratePerSqft) + '/SFT'],
        }] : []),
        ...workRows, ...specifications, ...brands,
      ];
    });
    return renderQuotationFallbackPdf({
      company: h.branding.name,
      companyAddress: address(h.branding.address),
      companyContact: [h.branding.phone, h.branding.email].filter(Boolean).join(' | '),
      customer: h.customer.name,
      customerContact: [h.customer.phone, h.customer.email].filter(Boolean).join(' | '),
      project: h.project.name,
      site: address(h.project.site_address),
      number: document.number,
      revision: document.revision,
      validUntil: document.valid_until,
      currency: document.currency,
      accent: h.branding.accent,
      logoDataUri: h.branding.logo_data_uri,
      coverImageDataUri: h.branding.cover_image_data_uri,
      total: number(document.totals.final_amount),
      items,
      // Terms and stage payments are saved on the revision; never invent
      // payment suggestions that the owner has not yet confirmed.
      terms: '',
      termSections: customerTermSections(document.terms),
      paymentSchedule: savedPdfPaymentRows(document.terms, document.totals.final_amount),
      notes: document.notes,
    });
  }
}
