/** A saved quotation is not exposed as a "Draft" workflow step in CRM.
 * Revision lifecycle states still protect issued quotes and approved sharing.
 */
export function leadQuoteLabel(status: string | null, shared = false): string {
  if (shared) return 'Shared';
  switch (status) {
    case 'issued': return 'Ready to share';
    case 'superseded': return 'Previous version';
    case 'cancelled': return 'Archived';
    default: return 'Saved';
  }
}
