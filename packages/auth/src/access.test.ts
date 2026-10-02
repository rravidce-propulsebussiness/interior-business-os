import { describe, expect, it } from 'vitest';
import type { TenantAccessContext } from '@business-os/core';
import { canAccess } from './index';

const context: TenantAccessContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  membershipStatus: 'active',
  grants: [{ permission: 'catalog.read', scope: { kind: 'organization' } }],
  entitlements: ['catalog'],
};
const request = {
  organizationId: 'org-1',
  permission: 'catalog.read',
  moduleKey: 'catalog',
};
describe('tenant authorization foundation', () => {
  it('allows an exact permission with an independent entitlement', () =>
    expect(canAccess(context, request)).toBe(true));
  it('denies anonymous access', () =>
    expect(canAccess(null, request)).toBe(false));
  it('denies cross-tenant access even with matching grants', () =>
    expect(canAccess(context, { ...request, organizationId: 'org-2' })).toBe(
      false,
    ));
  it('denies suspended membership', () =>
    expect(
      canAccess({ ...context, membershipStatus: 'suspended' }, request),
    ).toBe(false));
  it('denies absent permissions', () =>
    expect(
      canAccess(context, { ...request, permission: 'catalog.write' }),
    ).toBe(false));
  it('denies missing module entitlement', () =>
    expect(canAccess({ ...context, entitlements: [] }, request)).toBe(false));
  it('does not treat wildcard strings as permissions', () =>
    expect(
      canAccess(
        {
          ...context,
          grants: [{ permission: '*', scope: { kind: 'organization' } }],
        },
        request,
      ),
    ).toBe(false));
  it('keeps website and brochure access independent', () =>
    expect(
      canAccess(
        { ...context, entitlements: ['brochure'] },
        { ...request, moduleKey: 'website' },
      ),
    ).toBe(false));
  it('permits non-module operations without entitlements', () =>
    expect(
      canAccess(
        { ...context, entitlements: [] },
        { organizationId: 'org-1', permission: 'catalog.read' },
      ),
    ).toBe(true));
  it('restricts branch grants to an exact branch and tenant', () => {
    const branchContext: TenantAccessContext = {
      ...context,
      grants: [
        {
          permission: 'catalog.read',
          scope: { kind: 'branch', branchId: 'branch-1' },
        },
      ],
    };
    expect(canAccess(branchContext, { ...request, branchId: 'branch-1' })).toBe(
      true,
    );
    expect(canAccess(branchContext, { ...request, branchId: 'branch-2' })).toBe(
      false,
    );
    expect(canAccess(branchContext, request)).toBe(false);
    expect(
      canAccess(branchContext, {
        ...request,
        branchId: 'branch-1',
        organizationId: 'org-2',
      }),
    ).toBe(false);
  });
});
