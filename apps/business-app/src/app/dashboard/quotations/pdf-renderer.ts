import { renderPdf, PdfServiceError, renderQuotationFallbackPdf } from '@business-os/shared/pdf';
import type { CustomerDocument } from '@business-os/core/quotation-document';
import { parseSftEstimate } from '@business-os/core/sft-quotation';

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

/**
 * Prefer the full brochure PDF. Hostinger instances without an installed
 * Chromium browser use a real PDF-Lib A4 fallback rather than returning 503.
 * It includes the saved tenant identity, full work breakdown, all recorded
 * material brands/specifications, customer terms and totals.
 */
export async function renderQuotationPdf(html: string, document?: CustomerDocument) {
  try {
    return await renderPdf(html);
  } catch (error) {
    if (!(error instanceof PdfServiceError) || !document) throw error;
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
      total: number(document.totals.final_amount),
      items,
      terms: document.terms.replace(/\[\/?STAGE_PAYMENT_PLAN\]/g, ''),
      notes: document.notes,
    });
  }
}
