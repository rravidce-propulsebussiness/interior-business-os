/** Keep a saved quotation editable even if its source package was retired.
 * This value is UI-only; the server verifies the historical package against
 * the existing quotation line before accepting a save. */
export const SAVED_PACKAGE_OPTION = '__saved-quotation-package__';

type PackageChoice = { id: string; code: string };
type SavedSchedule = {
  package?: { id?: string; code: string } | undefined;
} | null;

export function initialConstructionPackageSelection(
  activePackages: readonly PackageChoice[],
  saved: SavedSchedule,
  hasCustomQuote: boolean,
  initialMode: 'sft' | 'custom',
  requestedPackageId?: string,
): string {
  if (hasCustomQuote) return 'custom';
  const matched = activePackages.find(
    (pkg) =>
      pkg.id === saved?.package?.id || pkg.code === saved?.package?.code,
  );
  if (matched) return matched.id;
  // Do not open an empty editor (or silently substitute a new package) for
  // quotations already containing measured floors and customer edits.
  if (saved) return SAVED_PACKAGE_OPTION;
  if (initialMode === 'custom' || requestedPackageId === 'custom')
    return 'custom';
  return (
    activePackages.find((pkg) => pkg.id === requestedPackageId)?.id ??
    (activePackages.length ? '' : 'custom')
  );
}
