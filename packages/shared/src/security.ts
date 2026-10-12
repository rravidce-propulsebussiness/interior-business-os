export function adminContentSecurityPolicy(nonce: string, development = false) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error('Invalid nonce');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Homepage imagery is served from a single allowlisted photo CDN. No script/connect access is granted.
    "img-src 'self' data: blob: https://images.unsplash.com",
    "font-src 'self'",
    "connect-src 'self'" + (development ? ' ws: wss:' : ''),
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
