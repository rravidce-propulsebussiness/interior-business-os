/** Human-readable terms sections persist in the existing quotation terms field.
 * Stage payment markers stay untouched for the payment schedule/PDF.
 * Legacy free text is preserved under "Additional terms" rather than lost. */
export type QuotationTermsSections = {
  inclusions: string;
  exclusions: string;
  warranty: string;
  additional: string;
  paymentPlan: string;
};
const HEADINGS = [
  ['Inclusions', 'inclusions'],
  ['Exclusions', 'exclusions'],
  ['Warranty', 'warranty'],
  ['Additional terms', 'additional'],
] as const;
const STAGE = /\[STAGE_PAYMENT_PLAN\][\s\S]*?\[\/STAGE_PAYMENT_PLAN\]/g;
const HEADER = /^(Inclusions|Exclusions|Warranty|Additional terms):[ \t]*$/gim;

export function splitQuotationTerms(terms: string): QuotationTermsSections {
  const savedPlans = terms.match(STAGE) ?? [];
  const paymentPlan = savedPlans.join('\n\n');
  const plain = terms.replace(STAGE, '').trim();
  const sections: QuotationTermsSections = {
    inclusions: '', exclusions: '', warranty: '', additional: '', paymentPlan,
  };
  const headings = [...plain.matchAll(HEADER)];
  if (!headings.length || headings[0]?.index !== 0) {
    sections.additional = plain;
    return sections;
  }
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    const label = heading[1]?.toLowerCase();
    const value = plain.slice(
      heading.index! + heading[0].length,
      headings[i + 1]?.index ?? plain.length,
    ).trim();
    const key = HEADINGS.find(([name]) => name.toLowerCase() === label)?.[1];
    if (key) {
      sections[key] = [sections[key], value].filter(Boolean).join('\n\n');
    }
  }
  return sections;
}

export function joinQuotationTerms(
  parts: Pick<QuotationTermsSections, 'inclusions'|'exclusions'|'warranty'|'additional'|'paymentPlan'>,
): string {
  const result = HEADINGS.flatMap(([title, key]) =>
    parts[key].trim() ? [title + ':\n' + parts[key].trim()] : []);
  if (parts.paymentPlan.trim()) result.push(parts.paymentPlan.trim());
  const text = result.join('\n\n');
  if (text.length > 10000) throw new Error('Terms exceed the 10,000-character limit.');
  return text;
}
