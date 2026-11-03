// Signed gateway for managed company subdomains and Cloudflare for SaaS
// custom hostnames (apex + www). All public-site ownership is rechecked by
// website_public in the Business OS database after the request reaches origin.
const BASE = 'sghomesinterior.in';
const RESERVED = new Set([
  'www', 'sites', 'admin', 'api', 'auth', 'dashboard', 'login', 'register',
  'mail', 'webmail', 'ftp', 'autodiscover', 'autoconfig', 'customers',
  'proxy-fallback',
]);
const encoder = new TextEncoder();

function validDnsHostname(hostname) {
  if (!hostname || hostname.length > 253 || hostname.includes('..')) return false;
  const labels = hostname.split('.');
  if (labels.length < 2) return false;
  if (!labels.every(label =>
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  )) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]{2,59}$/.test(tld);
}

function routableHostname(hostname) {
  if (!validDnsHostname(hostname)) return false;
  if (hostname === BASE) return false;
  if (hostname.endsWith('.' + BASE)) {
    const label = hostname.slice(0, -(BASE.length + 1));
    return !label.includes('.') && !RESERVED.has(label) &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label);
  }
  // Custom apex domains and customer subdomains are accepted here only as
  // transport candidates. The database authorizes the exact hostname later.
  return true;
}

export default {
  async fetch(request, env) {
    const input = new URL(request.url);
    const originalHost = input.hostname.toLowerCase();
    if (!routableHostname(originalHost))
      return new Response('Not found', { status: 404 });

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
    const signature = [...new Uint8Array(bytes)]
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Hostinger sees the apex; signed headers preserve the original company
    // or custom hostname for exact lookup by the shared public-site renderer.
    const upstream = new URL(input);
    upstream.hostname = BASE;
    const forwarded = new Request(upstream, request);
    for (const header of [
      'cookie', 'authorization', 'x-forwarded-host',
      'x-business-os-public-host', 'x-business-os-edge-host',
      'x-business-os-edge-time', 'x-business-os-edge-signature',
    ]) forwarded.headers.delete(header);
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
