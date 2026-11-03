/**
 * Match a published company website hostname before the database performs the
 * exact active-domain/published-version lookup. Managed subdomains are limited
 * to one first-level slug; customer-owned domains may be apex or www hosts.
 */
import { normalizedWorkspaceHost, validWorkspaceSlug } from './workspace-paths';

const RESERVED_HOSTS = new Set([
  'www', 'sites', 'admin', 'api', 'auth', 'dashboard', 'login',
  'register', 'mail', 'webmail', 'ftp', 'autodiscover', 'autoconfig',
  'customers', 'proxy-fallback',
]);

function validExternalHostname(hostname: string) {
  if (!hostname || hostname.length > 253 || hostname.includes('..')) return false;
  const labels = hostname.split('.');
  if (labels.length < 2) return false;
  if (!labels.every(label =>
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  )) return false;
  const tld = labels[labels.length - 1]!;
  return /^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]{2,59}$/.test(tld);
}

export function isManagedWebsiteHost(hostname: string, baseDomain: string) {
  const host = normalizedWorkspaceHost(hostname);
  const base = normalizedWorkspaceHost(baseDomain);
  if (!host || !base || host === base || !host.endsWith('.' + base))
    return false;
  const label = host.slice(0, -(base.length + 1));
  return !label.includes('.') &&
    !RESERVED_HOSTS.has(label) &&
    validWorkspaceSlug(label);
}

/**
 * Trusted only after HMAC verification at the edge. Exact domain ownership,
 * active state, TLS readiness and publication are checked again by website_public.
 */
export function isPublicWebsiteHost(hostname: string, baseDomain: string) {
  const host = normalizedWorkspaceHost(hostname);
  const base = normalizedWorkspaceHost(baseDomain);
  if (!host || !base || host === base) return false;
  if (host.endsWith('.' + base))
    return isManagedWebsiteHost(host, base);
  return validExternalHostname(host);
}
