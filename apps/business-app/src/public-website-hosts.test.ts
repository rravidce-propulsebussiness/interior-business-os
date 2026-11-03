import { describe, expect, it } from 'vitest';
import {
  isManagedWebsiteHost,
  isPublicWebsiteHost,
} from './public-website-hosts';

describe('public website hostname routing', () => {
  const base = 'sghomesinterior.in';

  it('routes only first-level company subdomains', () => {
    expect(isManagedWebsiteHost('neelima-constructions.sghomesinterior.in', base)).toBe(true);
    expect(isManagedWebsiteHost('Neelima-Constructions.SGHOMESINTERIOR.IN:443', base)).toBe(true);
    expect(isManagedWebsiteHost('other-company.sghomesinterior.in', base)).toBe(true);
  });

  it('leaves the Business OS and reserved service hosts alone', () => {
    for (const host of [
      base, 'www.sghomesinterior.in', 'sites.sghomesinterior.in',
      'admin.sghomesinterior.in', 'mail.sghomesinterior.in',
      'ftp.sghomesinterior.in', 'customers.sghomesinterior.in',
      'proxy-fallback.sghomesinterior.in',
      'sghomesinterior.in.attacker.test',
      'nested.neelima-constructions.sghomesinterior.in',
      'neelima-constructions.example.com',
      'neelima_constructions.sghomesinterior.in',
    ]) expect(isManagedWebsiteHost(host, base)).toBe(false);
  });

  it('accepts a signed customer apex or www hostname for database lookup', () => {
    expect(isPublicWebsiteHost('customer.com', base)).toBe(true);
    expect(isPublicWebsiteHost('www.customer.com', base)).toBe(true);
    expect(isPublicWebsiteHost('shop.customer.co.uk', base)).toBe(true);
    expect(isPublicWebsiteHost('customer.com:443', base)).toBe(true);
    expect(isPublicWebsiteHost('neelima-constructions.sghomesinterior.in', base)).toBe(true);
  });

  it('rejects provider roots, malformed names and nested provider subdomains', () => {
    for (const host of [
      base, 'www.sghomesinterior.in', 'a.b.sghomesinterior.in',
      'bad/x.customer.com', 'customer..com', 'localhost', '127.0.0.1',
      'customer.1', 'customer.com.attacker.test',
    ]) expect(isPublicWebsiteHost(host, base)).toBe(false);
    expect(isPublicWebsiteHost('customer.com', '')).toBe(false);
  });

  it('rejects malformed or empty managed-domain configuration', () => {
    expect(isManagedWebsiteHost('a.sghomesinterior.in', '')).toBe(false);
    expect(isManagedWebsiteHost('bad/x.sghomesinterior.in', base)).toBe(false);
    expect(isManagedWebsiteHost('a.sghomesinterior.in', 'bad base')).toBe(false);
  });
});
