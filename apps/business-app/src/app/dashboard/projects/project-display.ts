/** Generated hash codes are internal; people see the project name instead. */
export function displayProjectCode(code: string | null | undefined): string {
  const value = (code ?? '').trim();
  return /^[A-Z]?[0-9A-F]{24,}$/i.test(value) ? '' : value;
}
/** Drops storage ids such as "[3f2c…-…]" from a drawing reference. */
export function displayReference(reference: string): string {
  return reference.replace(/\s*\[[0-9a-f]{8}-[0-9a-f-]{27}\]/gi, '').trim();
}
