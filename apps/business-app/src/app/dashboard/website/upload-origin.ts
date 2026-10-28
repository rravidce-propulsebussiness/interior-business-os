/**
 * Protect website uploads against cross-origin requests even behind Hostinger
 * reverse proxies, which sometimes expose the internal listener as Request.url
 * and omit/replace the public Host header.
 *
 * Trust APP_ORIGIN (deployment-controlled), not client-supplied Forwarded-Host,
 * as an additional public origin. Never authorize an arbitrary Origin value.
 */
export function isAllowedWebsiteUploadOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let source: URL;
  try { source = new URL(origin); } catch { return false; }
  if (!['https:', 'http:'].includes(source.protocol) ||
      source.username || source.password ||
      source.pathname !== '/' || source.search || source.hash)
    return false;

  const candidates = [
    new URL(request.url).origin,
    request.headers.get('host') ?? '',
    request.headers.get('x-forwarded-host') ?? '',
  ];
  // These are owned by deployment configuration, not sent by the requester.
  const configured = [process.env.APP_ORIGIN,
    ...(process.env.BUSINESS_OS_CENTRAL_HOSTNAMES ?? '').split(',')];
  for (const value of configured) {
    const raw = value?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw.includes('://') ? raw : 'https://' + raw);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
        continue;
      if (url.protocol !== 'https:' &&
          !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:'))
        continue;
      candidates.push(url.origin);
    } catch {
      // Invalid deployment values cannot enable another origin.
    }
  }
  const good = (host: string) =>
    !!host && host.length <= 253 && /^[a-zA-Z0-9.:-]+$/.test(host) &&
    !host.includes('..') && !host.includes('@');
  return candidates.some(value => {
    try {
      const candidate = new URL(value.includes('://') ? value
        : source.protocol + '//' + value);
      if (!good(candidate.host)) return false;
      return candidate.origin.toLowerCase() === source.origin.toLowerCase();
    } catch { return false; }
  });
}
