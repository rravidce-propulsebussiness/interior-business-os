import { describe, expect, it } from 'vitest';

import {
  isManagedWebsiteHost,
  isPublicWebsiteHost,
} from './public-website-hosts';
import { workspaceIngress } from './workspace-paths';

const base = 'sghomesinterior.in';
const centralHosts = [base];

describe('ERP navigation does not change company or public website ingress', () => {
  it('keeps workspace-scoped ERP URLs on the existing central hostname', () => {
    const result = workspaceIngress({
      host: base,
      pathname: '/company-a/dashboard/operations',
      selectedSlug: null,
      centralHosts,
      enabled: true,
      method: 'GET',
    });
    expect(result).toMatchObject({
      scope: { type: 'slug', value: 'company-a' },
      rewrite: '/dashboard/operations',
    });
  });

  it('continues to resolve customer-owned dashboard hostnames exactly', () => {
    const result = workspaceIngress({
      host: 'customer-website.com',
      pathname: '/dashboard/execution',
      selectedSlug: 'unrelated-tenant',
      centralHosts,
      enabled: true,
      method: 'GET',
    });
    expect(result).toMatchObject({
      scope: { type: 'hostname', value: 'customer-website.com' },
      rewrite: null,
      denyPlatform: false,
    });
  });

  it('preserves managed wildcard and reserved service hostname boundaries', () => {
    expect(isManagedWebsiteHost('company-a.sghomesinterior.in', base)).toBe(true);
    expect(isManagedWebsiteHost('admin.sghomesinterior.in', base)).toBe(false);
    expect(isManagedWebsiteHost('a.b.sghomesinterior.in', base)).toBe(false);
    expect(isPublicWebsiteHost(base, base)).toBe(false);
    expect(isPublicWebsiteHost('customer-website.com', base)).toBe(true);
  });
});
