/**
 * Auth must always send users to the public browser-facing origin, never the
 * internal listening address (e.g. 0.0.0.0:3000) exposed by a reverse proxy.
 *
 * APP_ORIGIN is the preferred explicit configuration. Hostinger production
 * falls back to the fixed canonical Business OS domain when it is missing or
 * accidentally configured as an internal HTTP URL. Staging is fail-closed.
 *
 * Never construct OAuth redirects from Host/X-Forwarded-Host query or headers.
 */
const productionOrigin = 'https://sghomesinterior.in';
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

type AuthEnv = {
  APP_ORIGIN?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
};

export function publicAuthOrigin(
  requestUrl: string,
  env: AuthEnv = process.env,
): string {
  const production = env.APP_ENV === 'production' || env.NODE_ENV === 'production';
  const configured = env.APP_ORIGIN?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      const local =
        !production &&
        localHosts.has(parsed.hostname) &&
        ['http:', 'https:'].includes(parsed.protocol);
      const publicHttps =
        parsed.protocol === 'https:' &&
        !localHosts.has(parsed.hostname) &&
        parsed.hostname !== '0.0.0.0';
      if (
        (local || publicHttps) &&
        !parsed.username &&
        !parsed.password &&
        parsed.pathname === '/' &&
        !parsed.search &&
        !parsed.hash
      ) {
        return parsed.origin;
      }
    } catch {
      // Incorrect APP_ORIGIN must not leak an internal listener to browsers.
    }
  }

  // Production has a known canonical app domain; an internal Hostinger URL
  // must never be passed as the Supabase redirect_to or Location header.
  if (env.APP_ENV === 'staging') {
    throw new Error('APP_ORIGIN must be set to the staging public HTTPS origin');
  }
  if (production) return productionOrigin;

  try {
    const request = new URL(requestUrl);
    if (
      localHosts.has(request.hostname) &&
      ['http:', 'https:'].includes(request.protocol)
    ) {
      return request.origin;
    }
  } catch {
    // Only loopback is allowed as a development fallback.
  }
  return 'http://localhost:3000';
}
