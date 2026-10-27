/** Logs static route categories only; never tenant slugs, IDs or query strings. */
const sections = new Set([
  'billing',
  'crm',
  'quotations',
  'projects',
  'settings',
  'customers',
  'finance',
  'operations',
  'team',
  'company',
  'notifications',
  'reports',
  'marketplace',
  'website',
  'pricing',
]);
const apiSections = new Set([
  'auth',
  'billing',
  'crm',
  'quotations',
  'projects',
  'finance',
  'pdf',
]);

export function requestLogCategory(pathname: string): string | null {
  const parts = pathname.split('?')[0]?.split('/').filter(Boolean) ?? [];
  if (parts.length === 0) return 'home';
  const first = parts[0];
  if (!first || first.startsWith('_next') || first === '__hostinger_diag')
    return null;
  if (first === 'api' && ['health', 'ready'].includes(parts[1] ?? ''))
    return null;
  if (
    parts.some((item) =>
      /\.(?:js|css|ico|png|jpg|jpeg|gif|svg|webp|woff2?|map)$/i.test(item),
    )
  )
    return null;

  // Some tenant URLs have a workspace slug before the dashboard prefix.
  const index = first === 'dashboard' ? 0 : parts[1] === 'dashboard' ? 1 : -1;
  if (index >= 0) {
    const section = parts[index + 1] ?? 'overview';
    if (section === 'billing' && parts[index + 2] === 'new')
      return 'dashboard.billing.new';
    if (section === 'crm' && parts[index + 2] === 'leads')
      return 'dashboard.crm.leads';
    return 'dashboard.' + (sections.has(section) ? section : 'other');
  }

  if (first === 'api') {
    const section = parts[1] ?? 'other';
    return 'api.' + (apiSections.has(section) ? section : 'other');
  }
  if (['auth', 'login', 'register', 'client', 'admin'].includes(first))
    return first;
  return null;
}

export function requestLogMethod(method: string): string {
  const verb = method.toUpperCase();
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)
    ? verb
    : 'OTHER';
}

export function requestErrorName(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(error.name)
    ? error.name
    : 'UnknownError';
}
