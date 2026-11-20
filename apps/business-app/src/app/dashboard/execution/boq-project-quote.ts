/**
 * Which quotation a project's BOQ is built from. Pure and testable.
 *
 * Leads → customer → quotation → project: a BOQ belongs to a real project
 * (not a sales-prospect quote container) and uses that project's Final
 * quotation. Without a Final selection, the most recently created active
 * quotation of the project is used. Cancelled quotations are never used.
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
  customerId: string | null,
  candidates: readonly ProjectQuoteCandidate[],
  finalQuotationByCustomer: Readonly<Record<string, string>>,
): { quote: ProjectQuoteCandidate; isFinal: boolean } | null {
  const usable = candidates.filter(
    (quote) =>
      quote.projectId === projectId &&
      quote.revisionId &&
      quote.status !== 'cancelled' &&
      quote.revisionStatus !== 'cancelled',
  );
  const finalId = customerId ? finalQuotationByCustomer[customerId] : undefined;
  const final = usable.find((quote) => quote.quotationId === finalId);
  if (final) return { quote: final, isFinal: true };
  const latest = [...usable].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  return latest ? { quote: latest, isFinal: false } : null;
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
