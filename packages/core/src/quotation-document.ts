import { z } from 'zod';
import { addressSchema, brandingSchema } from './commercial';
import { parseSftEstimate } from './sft-quotation';
import { premiumCss, premiumSections } from './premium-quotation';
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
    money = (value: string) => `${escape(d.currency)} ${escape(value)}`;

  // Payment milestones are saved as an immutable part of the quotation's
  // customer-facing terms. Print a readable table without exposing markers.
  const paymentMarker = d.terms.match(/\[STAGE_PAYMENT_PLAN\]([\s\S]*?)\[\/STAGE_PAYMENT_PLAN\]/);
  const remainingTerms = d.terms.replace(/\[STAGE_PAYMENT_PLAN\][\s\S]*?\[\/STAGE_PAYMENT_PLAN\]/g, '').trim();
  const paymentRows = (paymentMarker?.[1] ?? '').trim().split(/\r?\n/).flatMap((line) => {
    const divider = line.lastIndexOf('|');
    if (divider <= 0) return [];
    const name = line.slice(0, divider).trim();
    const percent = Number(line.slice(divider + 1).trim());
    if (!name || name.length > 100 || !Number.isFinite(percent) || percent <= 0 || percent > 100) return [];
    return [{ name, percent }];
  });
  const paymentValid = paymentRows.length > 0 && paymentRows.length <= 40 &&
    Math.abs(paymentRows.reduce((sum, row) => sum + row.percent, 0) - 100) < 0.001;
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
  const packageAccent =
    sftSchedules.find(({ details }) => details.package?.themeColor)?.details
      .package?.themeColor ?? h.branding.accent;
  const renderSftSchedule = sftSchedules
    .map(
      ({ details }) =>
        '<section class="terms"><h2>Work-wise SFT estimate</h2><table><thead><tr>' +
        '<th>Work description</th><th>L (ft)</th><th>W (ft)</th><th>SFT</th>' +
        (h.display.unit_rate ? '<th class="amount">Rate / SFT</th>' : '') +
        '<th class="amount">Amount</th></tr></thead><tbody>' +
        details.rows
          .map(
            (row) =>
              '<tr><td>' +
              (row.kind === 'additional'
                ? '<span class="additional-work">Additional work</span>'
                : '') +
              escape(row.name) +
              '</td>' +
              '<td>' +
              escape(row.lengthFeet) +
              '</td><td>' +
              escape(row.widthFeet) +
              '</td>' +
              '<td>' +
              escape(row.areaSqft) +
              '</td>' +
              (h.display.unit_rate
                ? '<td class="amount">' + money(row.ratePerSqft) + '</td>'
                : '') +
              '<td class="amount">' +
              money(row.amount) +
              '</td></tr>',
          )
          .join('') +
        '<tr class="total"><td>Construction cost (floors + additions)</td><td></td><td></td><td>' +
        escape(details.totalAreaSqft) +
        '</td>' +
        (h.display.unit_rate ? '<td></td>' : '') +
        '<td class="amount">' +
        money(details.total) +
        '</td></tr>' +
        '</tbody></table><p class="muted">The floor-wise total is already included in the quotation summary; it is not an extra charge.</p></section>',
    )
    .join('');
  const sftSpecifications = sftSchedules
    .map(({ details }) => {
      const packageTitle = details.package
        ? '<div class="package-banner"><span>Selected construction package</span><h3>' +
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
        '<section class="spec-pages"><div class="spec-eyebrow">SECTION 02 / PACKAGE SPECIFICATIONS</div><h2>Package materials, finishes &amp; scope</h2><p class="muted">The descriptions below form part of this quotation and are saved with this revision.</p>' +
        packageTitle +
        (sections ||
          '<p class="muted">No additional written specifications supplied.</p>') +
        materialChoices +
        '<p class="muted">The material descriptions above do not add a second charge to the floor-wise estimate.</p></section>'
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
  const brochure = premiumSections(d);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(d.number)} R${d.revision}</title>${premiumCss.replaceAll('__ACCENT__', packageAccent)}</head><body><main>${brochure.cover}<header>${h.branding.logo_data_uri ? `<img alt="Business logo" src="${escape(h.branding.logo_data_uri)}">` : ''}<h1>${escape(h.branding.name)}</h1><p>${address(h.branding.address)}</p><p>${escape(h.branding.phone)} ${escape(h.branding.email)}</p>${h.branding.tax_identifier ? `<p>Tax ID: ${escape(h.branding.tax_identifier)}</p>` : ''}</header><div class="pb-title"><h1>Quotation ${escape(d.number)}</h1><p>Revision ${d.revision} · Valid until ${escape(d.valid_until)}</p>${d.status !== 'issued' ? `<p class="status">${escape(d.status.toUpperCase())}</p>` : ''}</div><div class="parties"><section><h2>Prepared for</h2><h3>${escape(h.customer.name)}</h3><p>${escape(h.customer.legal_name)}</p><p>${address(h.customer.billing_address)}</p><p>${escape(h.customer.phone)} ${escape(h.customer.email)}</p>${h.customer.tax_identifier ? `<p>Tax ID: ${escape(h.customer.tax_identifier)}</p>` : ''}</section><section><h2>Project</h2><h3>${escape(h.project.name)}</h3><p>${escape(h.project.code)}</p><p>${address(h.project.site_address)}</p></section></div><h2>2 · Pricing</h2><table><thead><tr><th class="line">Item / package</th>${h.display.quantity ? '<th>Quantity</th>' : ''}${h.display.unit_rate ? '<th class="amount">Unit rate</th>' : ''}<th class="amount">Amount</th></tr></thead><tbody>${grouped.map((l, index) => `${index === 0 || grouped[index - 1]?.area !== l.area ? `<tr><td colspan="${2 + Number(h.display.quantity) + Number(h.display.unit_rate)}"><h3>${escape(l.area || 'General work')}</h3></td></tr>` : ''}<tr${l.optional ? ' class="optional"' : ''}><td><strong>${escape(l.name)}</strong>${l.optional ? ' <strong>(optional)</strong>' : ''}${l.area ? `<p class="muted">${escape(l.area)}</p>` : ''}${constructionSpecs.includes(l) || parseSftEstimate(l.description) ? '' : `<p class="text">${escape(l.description)}</p>`}${h.display.specifications ? l.specifications.map((s) => `<p>${escape(s.label)}: ${escape(s.value)}</p>`).join('') : ''}${l.discount !== '0' ? `<p>Line discount: ${money(l.discount)}</p>` : ''}</td>${h.display.quantity ? `<td>${escape(l.quantity)} ${escape(l.unit)}</td>` : ''}${h.display.unit_rate ? `<td class="amount">${money(l.rate)}</td>` : ''}<td class="amount">${money(l.amount)}</td></tr>`).join('')}</tbody></table>${renderSftSchedule}<table class="totals"><tbody><tr><td>Line subtotal</td><td class="amount">${money(d.totals.line_subtotal)}</td></tr><tr><td>Line discounts</td><td class="amount">${money(d.totals.line_discount)}</td></tr><tr><td>Revision discount</td><td class="amount">${money(d.totals.revision_discount)}</td></tr><tr class="total"><td>Total payable</td><td class="amount">${money(d.totals.final_amount)}</td></tr><tr><td>Optional items (excluded)</td><td class="amount">${money(d.totals.optional_amount)}</td></tr></tbody></table>${(constructionSpecs.length || sftSpecifications) && h.display.specifications ? `<section class="terms">${constructionSpecs.length ? '<h2>3 · Materials &amp; brand specifications</h2>' : ''}${otherConstructionSpecs}${brochure.photo}${sftSpecifications}</section>` : ''}${d.notes ? `<section><h2>Notes</h2><p class="text">${escape(d.notes)}</p></section>` : ''}${paymentSection}${remainingTerms ? `<section class="terms"><h2>Terms and conditions</h2><p class="text">${escape(remainingTerms)}</p></section>` : ''}${brochure.end}</main></body></html>`;
}
