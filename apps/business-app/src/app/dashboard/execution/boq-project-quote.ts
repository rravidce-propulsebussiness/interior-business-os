/**
 * The database chooses the effective BOQ quotation for each project:
 * newest saved non-cancelled quotation by default, or a manually selected
 * Final quotation belonging to that project. Do not silently fall back here
 * if the tenant-scoped database lookup fails.
 */
export type ProjectQuoteCandidate = {
  quotationId: string;
  projectId: string;
  customerId: string;
  quotationNumber: string;
  revisionId: string | null;
  revisionNumber: number;
  status: string;
  revisionStatus: string;
  createdAt: string;
};

export function chooseProjectQuote(
  projectId: string,
  candidates: readonly ProjectQuoteCandidate[],
  effectiveQuotationByProject: Readonly<Record<string, string>>,
): { quote: ProjectQuoteCandidate; isFinal: boolean } | null {
  const effectiveId = effectiveQuotationByProject[projectId];
  if (!effectiveId) return null;
  const selected = candidates.find(
    (quote) =>
      quote.projectId === projectId &&
      quote.quotationId === effectiveId &&
      quote.revisionId &&
      quote.status !== 'cancelled' &&
      ['draft', 'issued'].includes(quote.revisionStatus),
  );
  return selected ? { quote: selected, isFinal: true } : null;
}

/** e.g. "Ravi · Premium estimate · Q-2026-000006 v2 · Final". */
export function projectQuoteLabel(input: {
  customerName: string | null;
  packageName: string | null;
  quotationNumber: string;
  revisionNumber: number;
  isFinal: boolean;
}) {
  const packageName = input.packageName?.trim();
  return [
    input.customerName?.trim() || 'Customer',
    packageName
      ? /estimate$/i.test(packageName)
        ? packageName
        : `${packageName} estimate`
      : 'Estimate',
    `${input.quotationNumber} v${input.revisionNumber}`,
    input.isFinal ? 'Final' : 'Latest',
  ].join(' · ');
}
