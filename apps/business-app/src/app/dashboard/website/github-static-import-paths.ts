/** Safe, bounded static HTML import paths. Framework source is never executed. */
export function importableHtmlPath(path: string): boolean {
  return path.length <= 240 &&
    /^(?:(?:pages|dist|build|out|public)\/)?(?:[a-z0-9-]+\/){0,3}[a-z0-9-]+\.html$/i.test(path) &&
    !path.includes('..');
}

/** Keep imported content out of existing live URLs until explicitly published. */
export function importedPageSlug(path: string): string {
  if (!importableHtmlPath(path)) throw new Error('Unsupported static HTML path');
  const relative = path.replace(/^(?:pages|dist|build|out|public)\//i, '').replace(/\.html$/i, '');
  const parts = relative.split('/');
  if (parts[parts.length - 1]?.toLowerCase() === 'index') parts.pop();
  return 'git-' + (parts.length ? parts.join('-').toLowerCase() : 'home');
}

export function importableStylesheetPath(path: string): boolean {
  return /^(?:(?:dist|build|out|public)\/)?(?:css\/)?(?:style|styles|main)\.css$/i.test(path);
}
