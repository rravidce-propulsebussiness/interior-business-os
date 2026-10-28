/**
 * Hostinger / reverse proxies can pass the public hostname in Forwarded-Host
 * while Request.url points to an internal server. Compare the browser Origin
 * to the public request hosts rather than only Request.url's internal origin.
 * Strictly reject cross-site Origins and malformed host values.
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
    new URL(request.url).host,
    request.headers.get('host') ?? '',
    request.headers.get('x-forwarded-host') ?? '',
  ];
  const good = (host: string) =>
    !!host && host.length <= 253 && /^[a-zA-Z0-9.:-]+$/.test(host) &&
    !host.includes('..') && !host.includes('@');
  return candidates.some(host => good(host) &&
    host.toLowerCase() === source.host.toLowerCase());
}
