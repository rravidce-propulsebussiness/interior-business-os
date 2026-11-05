export function adminContentSecurityPolicy(
  nonce: string,
  development = false,
  allowMetaWhatsAppSignup = false,
) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error('Invalid nonce');
  const metaScriptSources = allowMetaWhatsAppSignup
    ? ' https://connect.facebook.net https://www.facebook.com'
    : '';
  const metaConnectSources = allowMetaWhatsAppSignup
    ? ' https://connect.facebook.net https://www.facebook.com https://graph.facebook.com'
    : '';
  const metaFrameSources = allowMetaWhatsAppSignup
    ? ' https://www.facebook.com https://staticxx.facebook.com'
    : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}${metaScriptSources}`,
    "style-src 'self' 'unsafe-inline'",
    // Homepage imagery is served from a single allowlisted photo CDN. No script/connect access is granted.
    "img-src 'self' data: blob: https://images.unsplash.com",
    "font-src 'self'",
    "connect-src 'self'" + (development ? ' ws: wss:' : '') + metaConnectSources,
    "frame-src 'self' blob:" + metaFrameSources,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
