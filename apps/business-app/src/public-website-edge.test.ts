import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EDGE_HOST_HEADER, EDGE_SIGNATURE_HEADER, EDGE_TIME_HEADER,
  verifiedEdgeHostname,
} from './public-website-edge';

const baseDomain = 'sghomesinterior.in';
const host = 'neelima-constructions.sghomesinterior.in';
const secret = 'a'.repeat(64);
const now = 1793440000;

function signed(name = host, path = '/projects?x=1', method = 'GET', time = now) {
  const stamp = String(time);
  const message = [stamp, name, method, path].join('\n');
  return new Headers({
    [EDGE_HOST_HEADER]: name,
    [EDGE_TIME_HEADER]: stamp,
    [EDGE_SIGNATURE_HEADER]: createHmac('sha256', secret).update(message).digest('hex'),
  });
}
function verify(headers: Headers, extra: Record<string, unknown> = {}) {
  return verifiedEdgeHostname({
    headers, secret, baseDomain, method: 'GET',
    pathAndSearch: '/projects?x=1', now, ...extra,
  });
}
describe('authenticated company website edge routing', () => {
  it('accepts only valid fresh signed hostnames', () => {
    expect(verify(signed())).toBe(host);
    expect(verify(signed(host, '/projects?x=1', 'GET', now - 120))).toBe(host);
    expect(verify(signed(host, '/projects?x=1', 'GET', now - 121))).toBeNull();
  });
  it('rejects spoofed and privileged hostnames', () => {
    const h = signed();
    h.set(EDGE_HOST_HEADER, 'other-company.sghomesinterior.in');
    expect(verify(h)).toBeNull();
    expect(verify(signed('admin.sghomesinterior.in'))).toBeNull();
    expect(verify(signed('foo.example.com'))).toBeNull();
    expect(verify(signed('a.b.sghomesinterior.in'))).toBeNull();
  });
  it('binds the signature to method, path and query', () => {
    expect(verify(signed(), { method: 'POST' })).toBeNull();
    expect(verify(signed(), { pathAndSearch: '/different' })).toBeNull();
    expect(verify(signed(), { pathAndSearch: '/projects?x=2' })).toBeNull();
  });
  it('requires a sufficiently long secret', () => {
    expect(verify(signed(), { secret: undefined })).toBeNull();
    expect(verify(signed(), { secret: 'short' })).toBeNull();
  });
});
