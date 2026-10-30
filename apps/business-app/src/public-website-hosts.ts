/**
 * Match a published company website's first-level managed subdomain.
 *
 * Never use X-Forwarded-Host to select a tenant: the database's website_public
 * RPC authorizes an exact, active, HTTPS-ready hostname after routing.
 * Dashboard/platform hostnames are deliberately excluded.
 */
import { normalizedWorkspaceHost, validWorkspaceSlug } from './workspace-paths';

const RESERVED_HOSTS = new Set([
  'www', 'sites', 'admin', 'api', 'auth', 'dashboard', 'login',
  'register', 'mail', 'webmail', 'ftp', 'autodiscover',
]);

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
