// Route company websites to the existing Hostinger Node.js deployment.
// Activate only after the matching secret and Business OS feature flag exist.
const BASE = 'sghomesinterior.in';
const RESERVED = new Set(['www', 'admin', 'api', 'auth', 'sites', 'mail',
  'webmail', 'ftp', 'autoconfig', 'autodiscover', 'login', 'dashboard']);
const encoder = new TextEncoder();

function companyHost(hostname) {
  if (!hostname.endsWith('.' + BASE)) return false;
  const label = hostname.slice(0, -(BASE.length + 1));
  return label.length <= 63 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)
    && !RESERVED.has(label);
}

export default {
  async fetch(request, env) {
    const input = new URL(request.url);
    const originalHost = input.hostname.toLowerCase();
    if (!companyHost(originalHost)) return new Response('Not found', { status: 404 });
    const secret = env.BUSINESS_OS_PUBLIC_EDGE_SECRET;
    if (!secret || secret.length < 40) {
      return new Response('Public website gateway not configured', { status: 503 });
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = [timestamp, originalHost, request.method.toUpperCase(),
      input.pathname + input.search].join('\n');
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign'],
    );
    const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const signature = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Hostinger sees the apex, which is already associated with the Node app.
    // The signed headers preserve the original public hostname for DB lookup.
    const upstream = new URL(input);
    upstream.hostname = BASE;
    const forwarded = new Request(upstream, request);
    for (const key of [
      'cookie', 'authorization', 'x-forwarded-host',
      'x-business-os-public-host', 'x-business-os-edge-host',
      'x-business-os-edge-time', 'x-business-os-edge-signature',
    ]) forwarded.headers.delete(key);
    forwarded.headers.set('x-business-os-edge-host', originalHost);
    forwarded.headers.set('x-business-os-edge-time', timestamp);
    forwarded.headers.set('x-business-os-edge-signature', signature);

    const response = await fetch(forwarded, { redirect: 'manual' });
    const headers = new Headers(response.headers);
    headers.delete('set-cookie');
    headers.set('cache-control', 'private, no-store');
    const location = headers.get('location');
    if (location) {
      const target = new URL(location, upstream);
      if (target.hostname === BASE) {
        target.hostname = originalHost;
        headers.set('location', target.toString());
      }
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
