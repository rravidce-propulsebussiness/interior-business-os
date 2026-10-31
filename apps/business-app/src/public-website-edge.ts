import { createHmac, timingSafeEqual } from 'node:crypto';
import { isManagedWebsiteHost } from './public-website-hosts';

export const PUBLIC_SITE_HOST_HEADER = 'x-business-os-public-host';
export const EDGE_HOST_HEADER = 'x-business-os-edge-host';
export const EDGE_TIME_HEADER = 'x-business-os-edge-time';
export const EDGE_SIGNATURE_HEADER = 'x-business-os-edge-signature';

/** An upstream proxy may identify a public website only with a valid HMAC. */
export function verifiedEdgeHostname(input: {
  headers: Pick<Headers, 'get'>;
  secret?: string | undefined;
  baseDomain: string;
  method: string;
  pathAndSearch: string;
  now?: number;
}): string | null {
  const { headers, secret, baseDomain, method, pathAndSearch } = input;
  if (!secret || secret.length < 40) return null;
  const host = headers.get(EDGE_HOST_HEADER)?.toLowerCase() ?? '';
  if (!isManagedWebsiteHost(host, baseDomain)) return null;
  const timestamp = headers.get(EDGE_TIME_HEADER) ?? '';
  const signature = headers.get(EDGE_SIGNATURE_HEADER) ?? '';
  if (!/^\d{10}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const seconds = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(seconds - Number(timestamp)) > 120) return null;
  const payload = [timestamp, host, method.toUpperCase(), pathAndSearch].join('\n');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? host : null;
}
