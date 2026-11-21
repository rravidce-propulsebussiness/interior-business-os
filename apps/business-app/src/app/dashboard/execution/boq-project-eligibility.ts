/** A BOQ belongs to one real project and its effective Final quote
 * Saved BOQs remain in the register but never appear as new-work choices. */
type Project = { id: string };
type Quotation = { projectId: string; isFinal: boolean };
type SavedBoq = { project_id: string | null };

export function projectsReadyForNewBoq<P extends Project>(
  projects: readonly P[],
  quotations: readonly Quotation[],
  documents: readonly SavedBoq[],
): P[] {
  const withBoq = new Set(
    documents.map((document) => document.project_id).filter(Boolean),
  );
  const withFinalQuote = new Set(
    quotations.filter((quote) => quote.isFinal).map((quote) => quote.projectId),
  );
  return projects.filter(
    (project) => withFinalQuote.has(project.id) && !withBoq.has(project.id),
  );
}

/** Display every real project without mistaking a saved BOQ for new work. */
export function boqProjectOptionLabel(
  project: { name: string; customerName: string | null },
  state: 'new' | 'saved' | 'needs-final',
): string {
  const name = project.name.trim();
  const customer = project.customerName?.trim() ?? '';
  const title =
    customer && customer.toLocaleLowerCase() !== name.toLocaleLowerCase()
      ? `${customer} · ${name}`
      : name;
  const suffix =
    state === 'saved'
      ? 'BOQ saved · open to edit'
      : state === 'needs-final'
        ? 'Save a quotation first'
        : 'Ready for new BOQ';
  return `${title} — ${suffix}`;
}
