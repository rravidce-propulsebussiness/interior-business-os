import { renderQuotationFallbackPdf } from '@business-os/shared/pdf';
import { areaSqft } from './meta-lead-fields';

type Package = { name: string; rate_per_sqft: number };

const money = (value: number) =>
  'INR ' + Math.round(value).toLocaleString('en-IN');

/** Build a real, branded PDF for the indicative package quotation sent after YES. */
export async function renderMetaLeadQuotePdf(input: {
  companyName: string;
  leadName: string;
  projectSize: string;
  packages: Package[];
}) {
  const area = areaSqft(input.projectSize);
  const packages = input.packages
    .filter((item) => item.name && item.rate_per_sqft > 0)
    .slice(0, 8);
  const today = new Date();
  const validUntil = new Date(today.getTime() + 30 * 86400000);
  const number = `IND-${today.toISOString().slice(0, 10).replaceAll('-', '')}`;
  return renderQuotationFallbackPdf({
    company: input.companyName || 'Our team',
    companyAddress: '',
    companyContact: '',
    customer: input.leadName || 'Customer',
    customerContact: '',
    project: input.projectSize || 'Project enquiry',
    site: '',
    number,
    revision: 1,
    validUntil: validUntil.toISOString().slice(0, 10),
    currency: 'INR',
    accent: '#fa711c',
    total:
      area && packages.length
        ? `${money(Math.min(...packages.map((item) => item.rate_per_sqft)) * area)} onwards`
        : 'Based on final scope',
    items: packages.length
      ? packages.map((item) => ({
          heading: item.name,
          price: area
            ? `${money(item.rate_per_sqft * area)} estimate`
            : `${money(item.rate_per_sqft)} per sq ft`,
          details: [
            `${money(item.rate_per_sqft)} per sq ft`,
            ...(area
              ? [`Calculated for ${area.toLocaleString('en-IN')} sq ft`]
              : []),
          ],
        }))
      : [
          {
            heading: 'Custom quotation',
            details: [
              'Our team will confirm scope and pricing after reviewing your requirements.',
            ],
          },
        ],
    terms:
      'Indicative pricing only. Final price depends on measurements, scope, specifications, taxes and site conditions.',
    notes:
      'Reply on WhatsApp if you want our team to prepare a detailed quotation.',
  });
}

export function metaLeadQuoteFilename(companyName: string) {
  const company =
    companyName.replaceAll(/[^A-Za-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '') ||
    'Business';
  return `${company}_Indicative_Quotation.pdf`;
}
