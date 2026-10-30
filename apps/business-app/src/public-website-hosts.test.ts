import { describe, expect, it } from 'vitest';
import { isManagedWebsiteHost } from './public-website-hosts';

describe('public website hostname routing', () => {
  const base = 'sghomesinterior.in';
  it('routes only first-level company subdomains', () => {
    expect(isManagedWebsiteHost('neelima-constructions.sghomesinterior.in', base)).toBe(true);
    expect(isManagedWebsiteHost('Neelima-Constructions.SGHOMESINTERIOR.IN:443', base)).toBe(true);
    expect(isManagedWebsiteHost('other-company.sghomesinterior.in', base)).toBe(true);
  });
  it('leaves the Business OS and service hosts alone', () => {
    for (const host of [
      base, 'www.sghomesinterior.in', 'sites.sghomesinterior.in',
      'admin.sghomesinterior.in', 'mail.sghomesinterior.in',
      'ftp.sghomesinterior.in', 'sghomesinterior.in.attacker.test',
      'nested.neelima-constructions.sghomesinterior.in',
      'neelima-constructions.example.com', 'neelima_constructions.sghomesinterior.in',
    ]) expect(isManagedWebsiteHost(host, base)).toBe(false);
  });
  it('rejects malformed or empty configuration', () => {
    expect(isManagedWebsiteHost('a.sghomesinterior.in', '')).toBe(false);
    expect(isManagedWebsiteHost('bad/x.sghomesinterior.in', base)).toBe(false);
    expect(isManagedWebsiteHost('a.sghomesinterior.in', 'bad base')).toBe(false);
  });
});
