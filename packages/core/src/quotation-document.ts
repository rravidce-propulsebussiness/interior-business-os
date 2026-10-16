import { z } from 'zod';
import { addressSchema, brandingSchema } from './commercial';
import { parseSftEstimate } from './sft-quotation';
import { premiumCss, premiumSections } from './premium-quotation';
import { savedStagePaymentPlan } from './quotation-payment-plan';
import { customerTermSections } from './quotation-terms';
const money = z.string().regex(/^(0|[1-9]\d{0,79})(\.\d{1,100})?$/);
export const documentHeaderSchema = z.object({
  branding: brandingSchema,
  customer: z.object({
    name: z.string(),
    legal_name: z.string(),
    phone: z.string(),
    email: z.string(),
    tax_identifier: z.string(),
    billing_address: addressSchema,
  }),
  project: z.object({
    name: z.string(),
    code: z.string(),
    site_address: addressSchema,
  }),
  display: z.object({
    quantity: z.boolean(),
    unit_rate: z.boolean(),
    specifications: z.boolean(),
  }),
});
export const customerDocumentSchema = z.object({
  number: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(['draft', 'issued', 'superseded', 'cancelled']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  valid_until: z.iso.date(),
  header: documentHeaderSchema,
  terms: z.string(),
  notes: z.string(),
  lines: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      area: z.string(),
      optional: z.boolean(),
      quantity: money,
      unit: z.string(),
      rate: money,
      amount: money,
      discount: money,
      specifications: z.array(
        z.object({ label: z.string(), value: z.string() }),
      ),
    }),
  ),
  totals: z.object({
    line_subtotal: money,
    line_discount: money,
    subtotal: money,
    revision_discount: money,
    final_amount: money,
    optional_amount: money,
  }),
});
export type CustomerDocument = z.infer<typeof customerDocumentSchema>;
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const address = (a: z.infer<typeof addressSchema>) =>
  Object.values(a).filter(Boolean).map(escape).join(', ');
/** Parses to an allowlist before rendering. No generic row/object serialization. */
export function renderQuotationDocument(input: unknown): string {
  const d = customerDocumentSchema.parse(input),
    h = d.header,
    money = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && Number.isSafeInteger(Math.round(parsed * 100))
        ? new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: d.currency,
            maximumFractionDigits: 2,
          }).format(parsed)
        : `${escape(d.currency)} ${escape(value)}`;
    };

  // Payment milestones are saved as an immutable part of the quotation's
  // customer-facing terms. Print a readable table without exposing markers.
  const savedTerms = customerTermSections(d.terms);
  const paymentRows = savedStagePaymentPlan(d.terms) ?? [];
  const paymentValid = paymentRows.length > 0;
  const fullCents = Math.round(Number(d.totals.final_amount) * 100);
  let paidCents = 0;
  const paymentSection = paymentValid && Number.isSafeInteger(fullCents)
    ? '<section class="terms payment-plan"><h2>Proposed stage-wise payment schedule</h2>' +
      '<p class="muted">To be agreed in the contract. No invoice or payment has been raised.</p>' +
      '<table><thead><tr><th>Milestone</th><th>Share</th><th class="amount">Payment amount</th></tr></thead><tbody>' +
      paymentRows.map((row, index) => {
        const cents = index === paymentRows.length - 1
          ? fullCents - paidCents
          : Math.round(fullCents * row.percent / 100);
        paidCents += cents;
        return '<tr><td>' + escape(row.name) + '</td><td>' + row.percent.toFixed(2) +
          '%</td><td class="amount">' + money((cents / 100).toFixed(2)) + '</td></tr>';
      }).join('') +
      '<tr class="total"><td>Total</td><td>100%</td><td class="amount">' +
        money((fullCents / 100).toFixed(2)) + '</td></tr>' +
      '</tbody></table></section>'
    : '';
  const areaOrder = [...new Set(d.lines.map((line) => line.area))];
  const grouped = [...d.lines].sort(
    (a, b) => areaOrder.indexOf(a.area) - areaOrder.indexOf(b.area),
  );
  // Construction package and custom rate rows carry their customer-facing
  // brand choices in the saved description, not in mutable company settings.
  const constructionSpecs = d.lines.filter((line) =>
    line.description.includes('Materials / brands:'),
  );
  const sftSchedules = d.lines.flatMap((line) => {
    const details = parseSftEstimate(line.description);
    return details ? [{ line, details }] : [];
  });
  const packageAccent = h.branding.accent;
  const renderSftSchedule = sftSchedules
    .map(({ details }) =>
      '<section class="pb-estimate"><div class="pb-section-title"><h2>Work-wise SFT estimate</h2></div>' +
      '<p class="pb-section-subtitle">Dimensions, units, quantities and quotation-specific rates</p>' +
      '<table><thead><tr>' +
      '<th>Work description</th><th>L (ft)</th><th>W (ft)</th><th>H (ft)</th><th>Area / Qty</th>' +
      (h.display.unit_rate ? '<th class="amount">Rate</th>' : '') +
      '<th class="amount">Amount</th></tr></thead><tbody>' +
      details.rows.map((row) => {
        const unit = row.unit === 'running_ft' ? 'RFT'
          : row.unit === 'piece' ? 'Nos'
          : row.unit === 'lumpsum' ? 'LS'
          : row.unit === 'cubic_ft' ? 'CFT' : 'SFT';
        const hft = row.heightFeet?.trim() || '—';
        return '<tr><td>' +
          (row.kind === 'additional' ? '<span class="additional-work">Additional work</span>' : '') +
          escape(row.name) + '</td><td>' +
          escape(row.unit === 'piece' || row.unit === 'lumpsum' ? '—' : row.lengthFeet) +
          '</td><td>' +
          escape(row.unit === 'running_ft' || row.unit === 'wall_sqft' ||
            row.unit === 'piece' || row.unit === 'lumpsum' ? '—' : row.widthFeet) +
          '</td><td>' + escape(hft) + '</td><td>' +
          escape(row.areaSqft) + ' ' + unit + '</td>' +
          (h.display.unit_rate ? '<td class="amount">' + money(row.ratePerSqft) + '</td>' : '') +
          '<td class="amount">' + money(row.amount) + '</td></tr>';
      }).join('') +
      '<tr class="total"><td>Construction total (floors + additional works)</td>' +
      '<td></td><td></td><td></td><td>' +
      escape(details.totalAreaSqft) + ' SFT (floors)</td>' +
      (h.display.unit_rate ? '<td></td>' : '') +
      '<td class="amount">' + money(details.total) + '</td></tr></tbody></table></section>',
    ).join('');
  const sftSpecifications = sftSchedules
    .map(({ details }) => {
      const packageTitle = details.package
        ? '<div class="pb-spec-package"><span>Selected construction package</span><h3>' +
          escape(details.package.name) +
          ' · ' +
          escape(details.package.code) +
          '</h3><p>Base rate: ' +
          money(details.package.ratePerSqft) +
          ' per SFT</p></div>'
        : '';
      const sections = (details.sections ?? [])
        .filter((section) =>
          Boolean(
            section.description.trim() ||
            section.brand?.trim() ||
            section.grade?.trim() ||
            section.allowancePerSqft?.trim(),
          ),
        )
        .map(
          (section, index) =>
            '<article class="spec-item"><div class="spec-number">' +
            String(index + 1).padStart(2, '0') +
            '</div><div><h3>' +
            escape(section.title) +
            '</h3>' +
            (section.brand
              ? '<p><strong>Brand:</strong> ' + escape(section.brand) + '</p>'
              : '') +
            (section.grade
              ? '<p><strong>Grade:</strong> ' + escape(section.grade) + '</p>'
              : '') +
            (section.allowancePerSqft
              ? '<p><strong>Material allowance:</strong> ₹' +
                escape(section.allowancePerSqft) +
                '/SFT</p>'
              : '') +
            (section.description
              ? '<p class="text">' + escape(section.description) + '</p>'
              : '') +
            '</div></article>',
        )
        .join('');
      const materialChoices = details.materials.length
        ? '<section class="material-choices"><h3>Selected material &amp; brand inclusions</h3>' +
          details.materials
            .map(
              (material) =>
                '<p><strong>' +
                escape(material.category) +
                '</strong> · ' +
                escape(material.name) +
                (material.specification
                  ? ' — ' + escape(material.specification)
                  : '') +
                '</p>',
            )
            .join('') +
          '</section>'
        : '';
      return (
        '<div class="pb-package-specifications">' +
        packageTitle +
        (sections ||
          '<p class="muted">No additional written specifications supplied.</p>') +
        materialChoices +
        '<p class="pb-material-footnote">The inclusions above form part of this saved quotation and do not add a second charge.</p></div>'
      );
    })
    .join('');
  const otherConstructionSpecs = constructionSpecs
    .map(
      (line) =>
        '<section class="spec-item"><div><h3>' +
        escape(line.name) +
        '</h3><p class="text">' +
        escape(line.description) +
        '</p></div></section>',
    )
    .join('');

  const additionalSpecs = d.lines.flatMap((line) =>
    line.specifications.map((spec) => ({ item: line.name, ...spec })),
  ).map((spec, index) =>
    '<article class="spec-item"><div class="spec-number">' +
    String(index + 1).padStart(2, '0') +
    '</div><div><h3>' + escape(spec.label) + '</h3><p>' +
    '<strong>' + escape(spec.item) + '</strong> · ' +
    escape(spec.value) + '</p></div></article>',
  ).join('');
  const brochure = premiumSections(d);

  const hasSpecs = h.display.specifications &&
    Boolean(otherConstructionSpecs || sftSpecifications || additionalSpecs);
  const mainRows = grouped.filter((line) => !parseSftEstimate(line.description));
  const isFloorQuote = sftSchedules.length > 0;
  const itemTable = mainRows.length
    ? '<section class="pb-estimate"><div class="pb-section-title"><h2>' +
      (isFloorQuote ? 'Additional quoted items' : 'Detailed quotation') + '</h2></div>' +
      '<table><thead><tr><th class="line">Item / package</th>' +
      (h.display.quantity ? '<th>Quantity</th>' : '') +
      (h.display.unit_rate ? '<th class="amount">Unit rate</th>' : '') +
      '<th class="amount">Amount</th></tr></thead><tbody>' +
      mainRows.map((line) => '<tr' + (line.optional ? ' class="optional"' : '') + '>' +
        '<td><strong>' + escape(line.name) + '</strong>' +
        (line.optional ? ' <strong>(optional, excluded)</strong>' : '') +
        (line.description && !constructionSpecs.includes(line)
          ? '<p class="text">' + escape(line.description) + '</p>' : '') +
        '</td>' +
        (h.display.quantity ? '<td>' + escape(line.quantity) + ' ' + escape(line.unit) + '</td>' : '') +
        (h.display.unit_rate ? '<td class="amount">' + money(line.rate) + '</td>' : '') +
        '<td class="amount">' + money(line.amount) + '</td></tr>').join('') +
      '</tbody></table></section>'
    : '';
  const nonZero = (value: string) => Number(value) !== 0;
  const adjustments = [
    ...(nonZero(d.totals.line_discount)
      ? [['Line discounts', money(d.totals.line_discount)]] : []),
    ...(nonZero(d.totals.revision_discount)
      ? [['Quotation discount', money(d.totals.revision_discount)]] : []),
    ...(nonZero(d.totals.optional_amount)
      ? [['Optional items (excluded)', money(d.totals.optional_amount)]] : []),
  ];
  const adjustmentMarkup = adjustments.length
    ? '<div class="pb-adjustments">' + adjustments.map(([name, value]) =>
      '<p><span>' + name + '</span><strong>' + value + '</strong></p>').join('') + '</div>'
    : '';
  const introCards =
    '<div class="pb-intro-grid">' +
    '<section class="pb-intro-card"><div class="pb-mini-head"><span class="pb-intro-icon">●</span>Prepared for</div>' +
    '<h3>' + escape(h.customer.name) + '</h3><p>' + address(h.customer.billing_address) + '</p>' +
    (h.customer.phone ? '<p>Tel: ' + escape(h.customer.phone) + '</p>' : '') +
    (h.customer.email ? '<p>' + escape(h.customer.email) + '</p>' : '') + '</section>' +
    '<section class="pb-intro-card project"><div class="pb-mini-head"><span class="pb-intro-icon">⌂</span>' +
    (h.project.code?.startsWith('Q') ? 'Quotation scope' : 'Project') + '</div>' +
    '<h3>' + escape(h.project.name) + '</h3>' +
    (h.project.code && !h.project.code.startsWith('Q') ? '<p>Ref: ' + escape(h.project.code) + '</p>' : '') +
    '<p>' + address(h.project.site_address) + '</p></section></div>';
  const specificationPage = hasSpecs ?
    '<section class="pb-page pb-specs-page">' +
    brochure.pageHeader('Materials & specifications') + brochure.specHero +
    '<div class="pb-section-title"><h2>Selected package inclusions</h2></div>' +
    '<p class="pb-section-subtitle">These are the actual materials, brands, grades and allowances recorded for this quotation.</p>' +
    otherConstructionSpecs + '<div class="pb-spec-card-grid">' +
    additionalSpecs + sftSpecifications + '</div>' +
    brochure.pageFooter('Material specifications') + '</section>'
    : '';
  const schedulePage =
    '<section class="pb-page pb-payment-page">' +
    brochure.pageHeader('Payments / terms') +
    '<div class="pb-section-title"><h2>Payment schedule &amp; conditions</h2></div>' +
    (paymentSection ||
      '<div class="pb-terms-panel"><h2>Stage-wise payments not specified</h2>' +
      '<p class="text">No confirmed payment milestones are included in this quotation revision. ' +
      'Payment terms must be agreed and documented before they are treated as part of the contract.</p></div>') +
    (d.notes ? '<section class="pb-terms-panel"><h2>Project notes</h2>' +
      '<p class="text">' + escape(d.notes) + '</p></section>' : '') +
    '<section class="pb-terms-panel pb-quote-conditions">' +
      '<h2>Terms &amp; Inclusions</h2>' +
      (savedTerms.length ? savedTerms.map(section => '<div class="pb-term-section"><h3>' +
        escape(section.title) + '</h3><p class="text">' +
        escape(section.text) + '</p></div>').join('') :
        '<p class="text muted">No additional quotation-specific conditions have been saved.</p>') +
      '</section>' +
    brochure.pageFooter('Payments / terms') + '</section>';
  const amountLabel = isFloorQuote ? 'Total proposed construction cost' : 'Total quotation amount';
  const total = '<div class="pb-final-total"><span>' + amountLabel +
    '</span><strong>' + money(d.totals.final_amount) + '</strong></div>';
  const pricingPage = '<section class="pb-page pb-pricing">' +
    brochure.pageHeader('Project details / estimate') + introCards +
    '<p class="pb-quote-meta">Quotation ' + escape(d.number) +
    ' · Revision ' + d.revision + ' · Valid until ' + escape(d.valid_until) + '</p>' +
    (isFloorQuote ? renderSftSchedule + itemTable : itemTable) +
    adjustmentMarkup + total +
    '<p class="pb-pricing-caption">Only the included quoted amounts are part of the total. ' +
    'Payment terms, detailed specifications and any exclusions are shown in the following sections.</p>' +
    brochure.pageFooter('Work-wise estimate') + '</section>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escape(d.number)} R${d.revision}</title>
    ${premiumCss.replaceAll('__ACCENT__', packageAccent)}</head><body><main>
    ${brochure.cover}${pricingPage}${specificationPage}${schedulePage}${brochure.close}
    </main></body></html>`;

}
