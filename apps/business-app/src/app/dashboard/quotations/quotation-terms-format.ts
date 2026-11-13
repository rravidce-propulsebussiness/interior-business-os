/** Human-readable terms sections persist in the existing quotation terms field.
 * Stage payment markers stay untouched for the payment schedule/PDF.
 * Legacy free text is preserved under "Additional terms" rather than lost. */
export type QuotationTermsSections = {
  inclusions: string;
  exclusions: string;
  warranty: string;
  additional: string;
  workProgramme: string;
  termination: string;
  disputeResolution: string;
  paymentPlan: string;
};
const HEADINGS = [
  ['Inclusions', 'inclusions'],
  ['Exclusions', 'exclusions'],
  ['Warranty', 'warranty'],
  ['Additional terms', 'additional'],
  ['Work programme & completion', 'workProgramme'],
  ['Termination & indemnification', 'termination'],
  ['Dispute resolution', 'disputeResolution'],
] as const;
const STAGE = /\[(STAGE_PAYMENT_PLAN|STAGE_PAYMENT_LINKS|STAGE_CUSTOM_REQUIREMENTS|QUOTATION_MILESTONE_FLOW)\][\s\S]*?\[\/\1\]/g;
const HEADER = /^(Inclusions|Exclusions|Warranty|Additional terms|Work programme & completion|Termination & indemnification|Dispute resolution):[ \t]*$/gim;

export function splitQuotationTerms(terms: string): QuotationTermsSections {
  const savedPlans = terms.match(STAGE) ?? [];
  const paymentPlan = savedPlans.join('\n\n');
  const plain = terms.replace(STAGE, '').trim();
  const sections: QuotationTermsSections = {
    inclusions: '', exclusions: '', warranty: '', additional: '',
    workProgramme: '', termination: '', disputeResolution: '', paymentPlan,
  };
  const headings = [...plain.matchAll(HEADER)];
  if (!headings.length) {
    sections.additional = plain;
    return sections;
  }
  // Old terms can contain introductory free text before structured
  // conditions. Keep that text instead of swallowing named sections.
  if ((headings[0]?.index ?? 0) > 0)
    sections.additional = plain.slice(0,headings[0]!.index).trim();
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
  parts: Pick<QuotationTermsSections, 'inclusions'|'exclusions'|'warranty'|'additional'|'paymentPlan'> &
    Partial<Pick<QuotationTermsSections, 'workProgramme'|'termination'|'disputeResolution'>>,
): string {
  const result = HEADINGS.flatMap(([title, key]) =>
    (parts[key] ?? '').trim() ? [title + ':\n' + (parts[key] ?? '').trim()] : []);
  if (parts.paymentPlan.trim()) result.push(parts.paymentPlan.trim());
  const text = result.join('\n\n');
  if (text.length > 10000) throw new Error('Terms exceed the 10,000-character limit.');
  return text;
}
