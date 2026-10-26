/** The "View all" link must never retain a stage, priority or search filter.
 * Preserve the board/list presentation only.
 */
export function allLeadsHref(view: 'list' | 'board'): string {
  return view === 'board'
    ? '/dashboard/crm/leads?view=board'
    : '/dashboard/crm/leads';
}
