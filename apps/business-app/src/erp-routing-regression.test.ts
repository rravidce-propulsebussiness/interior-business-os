import { describe, expect, it } from 'vitest';

import {
  isManagedWebsiteHost,
  isPublicWebsiteHost,
} from './public-website-hosts';
import { workspaceIngress } from './workspace-paths';

const base = 'sghomesinterior.in';
const centralHosts = [base];

describe('ERP keeps website ingress unchanged', () => {
  it('keeps scoped ERP URLs on the central hostname', () => {
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

  it('keeps exact custom-domain tenant scope', () => {
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

  it('preserves wildcard and reserved hosts', () => {
    const managed = (host: string) => isManagedWebsiteHost(host, base);
    expect(managed('company-a.sghomesinterior.in')).toBe(true);
    expect(managed('admin.sghomesinterior.in')).toBe(false);
    expect(managed('a.b.sghomesinterior.in')).toBe(false);
    expect(isPublicWebsiteHost(base, base)).toBe(false);
    expect(isPublicWebsiteHost('customer-website.com', base)).toBe(true);
  });
});
