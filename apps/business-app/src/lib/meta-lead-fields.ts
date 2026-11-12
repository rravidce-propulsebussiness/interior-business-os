/**
 * Pure helpers for Meta (Facebook/Instagram) lead forms: turning a submitted
 * form into a CRM lead, and writing the WhatsApp messages sent to that lead.
 * No I/O here so every rule is unit-tested.
 */

export type MetaLeadField = { name?: unknown; values?: unknown };
export type MetaLead = {
  id?: unknown;
  created_time?: unknown;
  field_data?: unknown;
  ad_name?: unknown;
  campaign_name?: unknown;
  platform?: unknown;
  form_id?: unknown;
};

export type MappedMetaLead = {
  name: string;
  phone: string;
  email: string;
  location: string;
  service_type: string;
  project_size: string;
  notes: string;
  /** Digits-only WhatsApp ID, or '' when the phone cannot be messaged. */
  wa_id: string;
  platform: string;
  /** Every answer except name/phone/email, for the confirmation message. */
  details: Array<{ label: string; value: string }>;
};

const clean = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim()
    : '';

/** `what_is_your_budget?` → `What is your budget?` */
export function fieldLabel(key: string) {
  const text = clean(key).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function fieldValue(field: MetaLeadField) {
  const values = Array.isArray(field.values) ? field.values : [field.values];
  return values.map(clean).filter(Boolean).join(', ');
}

/**
 * WhatsApp needs a full international number. Indian forms often collect a
 * bare 10-digit mobile, so those get the form's default country code.
 */
export function whatsappId(phone: string, defaultCountryCode = '91') {
  const raw = clean(phone);
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const international = raw.startsWith('+') || raw.startsWith('00');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (!international) {
    digits = digits.replace(/^0+/, '');
    if (digits.length === 10) digits = defaultCountryCode + digits;
  }
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : '';
}

const SIZE =
  /sq\.?\s?ft|sqft|square|built.?up|carpet|plot size|\bsize\b|\bbhk\b/i;
const PLACE =
  /city|location|locality|address|pin ?code|zip|post ?code|\barea\b|\bstate\b|\btown\b/i;
const SERVICE =
  /service|requirement|looking for|interested|project type|property type|type of|\bneed\b/i;

export function mapMetaLead(
  lead: MetaLead,
  options: { defaultCountryCode?: string } = {},
): MappedMetaLead {
  const fields = (Array.isArray(lead.field_data) ? lead.field_data : [])
    .filter(
      (field): field is MetaLeadField => !!field && typeof field === 'object',
    )
    .map((field) => ({
      key: clean(field.name).toLowerCase(),
      label: fieldLabel(clean(field.name)),
      value: fieldValue(field),
    }))
    .filter((field) => field.key && field.value);

  const take = (test: (key: string) => boolean) =>
    fields.find((field) => test(field.key))?.value ?? '';
  const spaced = (key: string) => key.replace(/_/g, ' ');

  const first = take((key) => key === 'first_name');
  const last = take((key) => key === 'last_name');
  const name =
    take((key) => key === 'full_name') ||
    [first, last].filter(Boolean).join(' ') ||
    take(
      (key) => /\bname\b/.test(spaced(key)) && !/company|business/.test(key),
    );
  const phone =
    take((key) => key === 'phone_number') ||
    take((key) => /phone|mobile|whatsapp|contact number/.test(spaced(key)));
  const email = take((key) => /e-?mail/.test(key));

  const used = new Set(
    fields
      .filter(
        (field) =>
          ['full_name', 'first_name', 'last_name', 'phone_number'].includes(
            field.key,
          ) ||
          field.value === name ||
          field.value === phone ||
          field.value === email,
      )
      .map((field) => field.key),
  );
  const details = fields
    .filter((field) => !used.has(field.key))
    .map(({ label, value }) => ({ label, value }));

  const rest = fields.filter((field) => !used.has(field.key));
  const size = rest.find((field) => SIZE.test(spaced(field.key)));
  const place = rest.filter(
    (field) => field !== size && PLACE.test(spaced(field.key)),
  );
  const service = rest.find(
    (field) =>
      field !== size &&
      !place.includes(field) &&
      SERVICE.test(spaced(field.key)),
  );

  const context = [
    ['Campaign', clean(lead.campaign_name)],
    ['Ad', clean(lead.ad_name)],
    ['Platform', clean(lead.platform)],
  ].filter(([, value]) => value);
  const notes = [
    ...details.map(({ label, value }) => `${label}: ${value}`),
    ...context.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');

  return {
    name: name.slice(0, 200),
    phone: phone.slice(0, 50),
    email: email.slice(0, 254),
    location: place
      .map((field) => field.value)
      .join(', ')
      .slice(0, 500),
    service_type: (service?.value ?? '').slice(0, 200),
    project_size: (size?.value ?? '').slice(0, 200),
    notes: notes.slice(0, 10000),
    wa_id: whatsappId(phone, options.defaultCountryCode),
    platform: clean(lead.platform).slice(0, 40),
    details,
  };
}

/**
 * Meta rejects template values containing new lines, tabs or runs of spaces,
 * and empty values, so every value is flattened and never blank.
 */
export function templateValue(value: string, max = 1024) {
  const flat = value.replace(/\s+/g, ' ').trim();
  return (flat || '-').slice(0, max);
}

/** `Requirement: 3 BHK interiors; City: Hyderabad` */
export function detailsSummary(
  details: Array<{ label: string; value: string }>,
  max = 600,
) {
  const parts: string[] = [];
  let length = 0;
  for (const { label, value } of details) {
    const part = `${label}: ${value}`;
    if (length + part.length + 2 > max) break;
    parts.push(part);
    length += part.length + 2;
  }
  return templateValue(parts.join('; ') || 'your enquiry', max);
}

/**
 * Body values for the confirmation template, in fixed order:
 * {{1}} lead name, {{2}} submitted details, {{3}} company name.
 */
export function confirmationParameters(
  input: {
    name: string;
    details: Array<{ label: string; value: string }>;
    companyName: string;
  },
  count: number,
) {
  return [
    templateValue(input.name || 'there', 60),
    detailsSummary(input.details),
    templateValue(input.companyName || 'our team', 100),
  ].slice(0, Math.max(0, Math.min(3, count)));
}

export const DEFAULT_QUOTE_MESSAGE = [
  'Thank you {{name}}! Your details are confirmed.',
  '',
  'Our indicative packages:',
  '{{packages}}',
  '',
  'These are starting rates. Our team will call you with a detailed quotation.',
].join('\n');

export const DEFAULT_CONFIRMATION_TEMPLATE = {
  name: 'lead_details_confirmation',
  language: 'en',
  body: 'Hi {{1}}, thank you for your enquiry with {{3}}. We received these details: {{2}}. Reply YES to confirm and we will share our quotation.',
};

const rupees = (value: number) =>
  '₹' + Math.round(value).toLocaleString('en-IN');

/** Built-up area in sq ft, when the form answer is clearly an area. */
export function areaSqft(projectSize: string) {
  if (/bhk/i.test(projectSize)) return null;
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(projectSize);
  if (!match) return null;
  const value = Number(match[1]!.replace(/,/g, ''));
  return Number.isFinite(value) && value >= 100 && value <= 100000
    ? value
    : null;
}

export function packageLines(
  packages: Array<{ name: string; rate_per_sqft: number }>,
  projectSize: string,
) {
  const area = areaSqft(projectSize);
  return packages
    .filter((item) => item.name && item.rate_per_sqft > 0)
    .slice(0, 8)
    .map((item) => {
      const rate = `${rupees(item.rate_per_sqft)} per sq ft`;
      return area
        ? `• ${item.name}: ${rate} (about ${rupees(item.rate_per_sqft * area)} for ${area.toLocaleString('en-IN')} sq ft)`
        : `• ${item.name}: ${rate}`;
    });
}

/** Fill the company's quotation message for one lead. */
export function buildQuoteMessage(input: {
  template: string;
  name: string;
  companyName: string;
  projectSize: string;
  packages: Array<{ name: string; rate_per_sqft: number }>;
}) {
  const lines = packageLines(input.packages, input.projectSize);
  const packages = lines.length
    ? lines.join('\n')
    : 'Our team will share your package options shortly.';
  return (input.template.trim() || DEFAULT_QUOTE_MESSAGE)
    .replace(/\{\{\s*name\s*\}\}/gi, input.name.trim() || 'there')
    .replace(/\{\{\s*company\s*\}\}/gi, input.companyName.trim() || 'our team')
    .replace(/\{\{\s*packages\s*\}\}/gi, packages)
    .trim()
    .slice(0, 3500);
}
