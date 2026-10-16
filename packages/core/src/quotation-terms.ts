/** Parse the saved customer-facing terms without leaking payment-plan markers.
 * Legacy plain text remains "Additional terms". Stage data is parsed separately
 * by savedStagePaymentPlan; no mutable package/settings lookup is required.
 */
export type CustomerTermSection = { title: string; text: string };
const sections = ['Inclusions', 'Exclusions', 'Warranty', 'Additional terms'] as const;
const stageBlock = /\[STAGE_PAYMENT_PLAN\][\s\S]*?\[\/STAGE_PAYMENT_PLAN\]/g;
const headings = /^(Inclusions|Exclusions|Warranty|Additional terms):[ \t]*$/gim;

export function customerTermSections(source: string): CustomerTermSection[] {
  const plain = source.replace(stageBlock, '').trim();
  if (!plain) return [];
  const matches = [...plain.matchAll(headings)];
  if (!matches.length || matches[0]?.index !== 0)
    return [{ title: 'Additional terms', text: plain }];
  const found: CustomerTermSection[] = [];
  for (let i=0;i<matches.length;i++) {
    const match=matches[i]!;
    const label=sections.find(s => s.toLowerCase() === match[1]?.toLowerCase());
    if (!label) continue;
    const text=plain.slice((match.index ?? 0)+match[0].length,
      matches[i+1]?.index ?? plain.length).trim();
    if (text) found.push({ title: label, text });
  }
  return found;
}
