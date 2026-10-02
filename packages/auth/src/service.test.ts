import { describe, it, expect, vi } from 'vitest';
import { createAuthorization } from './service';
import type { AuthorizationPort } from './service';
import { DomainError } from '@business-os/shared';
import { moduleNavigation } from './index';

const userId = '00000000-0000-4000-8000-000000000001';
const orgId = '00000000-0000-4000-8000-000000000002';
const otherOrg = '00000000-0000-4000-8000-000000000003';
const context = {
  userId,
  organizationId: orgId,
  membershipId: '00000000-0000-4000-8000-000000000004',
  membershipStatus: 'active' as const,
  roles: [
    {
      id: '00000000-0000-4000-8000-000000000005',
      name: 'Custom',
      branchId: null,
    },
  ],
  grants: [
    { permission: 'brochure.view', scope: { kind: 'organization' as const } },
    { permission: 'website.view', scope: { kind: 'organization' as const } },
  ],
  entitlements: ['brochure'],
};
function setup(overrides: Partial<AuthorizationPort> = {}) {
  const port: AuthorizationPort = {
    user: vi.fn(async () => ({ id: userId })),
    context: vi.fn(async () => context),
    platformContext: vi.fn(async () => ({ roles: [], permissions: [] })),
    hasEntitlement: vi.fn(async () => false),
    ...overrides,
  };
  return { port, auth: createAuthorization(port) };
}
describe('server authorization services', () => {
  it.each(['catalog.view', 'catalog.manage', 'pricing.view', 'pricing.manage'])(
    'requires both %s and its entitlement',
    async (permission) => {
      const moduleKey = permission.split('.')[0]!;
      const granted = {
        ...context,
        grants: [{ permission, scope: { kind: 'organization' as const } }],
        entitlements: [moduleKey],
      };
      const { auth } = setup({ context: async () => granted });
      await expect(
        auth.requirePermission(orgId, permission, { moduleKey }),
      ).resolves.toMatchObject({ organizationId: orgId });
      granted.entitlements = [];
      await expect(
        auth.requirePermission(orgId, permission, { moduleKey }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      granted.entitlements = [moduleKey];
      granted.grants = [];
      await expect(
        auth.requirePermission(orgId, permission, { moduleKey }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
  it('rejects unauthenticated users before querying tenant context', async () => {
    const { auth, port } = setup({ user: async () => null });
    await expect(
      auth.requireOrganizationMembership(orgId),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(port.context).not.toHaveBeenCalled();
  });
  it('validates organization identifiers before data access', async () => {
    const { auth, port } = setup();
    await expect(
      auth.requireOrganizationMembership('tampered'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(port.context).not.toHaveBeenCalled();
  });
  it('rejects context for another user', async () => {
    const { auth } = setup({
      context: async () => ({ ...context, userId: otherOrg }),
    });
    await expect(
      auth.requireOrganizationMembership(orgId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rejects context for another tenant', async () => {
    const { auth } = setup();
    await expect(
      auth.requireOrganizationMembership(otherOrg),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rejects suspended context even if a faulty adapter returns it', async () => {
    const { auth } = setup({
      context: async () => ({ ...context, membershipStatus: 'suspended' }),
    });
    await expect(auth.requireOrganizationMembership(orgId)).rejects.toThrow();
  });
  it('accepts a valid organization switch', async () => {
    const { auth } = setup();
    await expect(auth.validateOrganizationSwitch(orgId)).resolves.toBe(orgId);
  });
  it('does not trust a selected organization cookie', async () => {
    const { auth } = setup({
      context: async () => {
        throw new DomainError('FORBIDDEN');
      },
    });
    await expect(
      auth.validateOrganizationSwitch(otherOrg),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('requires both permission and entitlement on direct module access', async () => {
    const { auth } = setup();
    await expect(
      auth.requirePermission(orgId, 'brochure.view', { moduleKey: 'brochure' }),
    ).resolves.toMatchObject({ organizationId: orgId });
    await expect(
      auth.requirePermission(orgId, 'website.view', { moduleKey: 'website' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('independently asks the database for current entitlement access', async () => {
    const { auth, port } = setup();
    await expect(
      auth.requireEntitlement(orgId, 'brochure'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(port.hasEntitlement).toHaveBeenCalledWith(orgId, 'brochure');
  });
  it('does not cache revoked membership across calls', async () => {
    let revoked = false;
    const { auth } = setup({
      context: async () => {
        if (revoked) throw new DomainError('FORBIDDEN');
        return context;
      },
    });
    await auth.requireOrganizationMembership(orgId);
    revoked = true;
    await expect(
      auth.requireOrganizationMembership(orgId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('does not make a business Owner a platform administrator', async () => {
    const { auth } = setup({
      context: async () => ({
        ...context,
        roles: [{ id: userId, name: 'Owner', branchId: null }],
      }),
    });
    await expect(
      auth.requirePlatformPermission('platform.access'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('resolves configurable platform permissions and exact roles', async () => {
    const { auth } = setup({
      platformContext: async () => ({
        roles: ['custom_platform_role'],
        permissions: ['platform.access'],
      }),
    });
    await expect(
      auth.requirePlatformPermission('platform.access'),
    ).resolves.toBeDefined();
    await expect(
      auth.requirePlatformRole('custom_platform_role'),
    ).resolves.toBeDefined();
    await expect(
      auth.requirePlatformRole('platform_super_admin'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('unions roles through permission grants instead of role names', async () => {
    const { auth } = setup({
      context: async () => ({
        ...context,
        grants: [
          ...context.grants,
          { permission: 'team.view', scope: { kind: 'organization' } },
        ],
      }),
    });
    await expect(
      auth.requirePermission(orgId, 'team.view'),
    ).resolves.toBeDefined();
    await expect(
      auth.requirePermission(orgId, 'team.manage'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('uses the same policy for navigation and preserves module independence', () => {
    expect(
      moduleNavigation(context, [
        {
          key: 'website',
          name: 'Site',
          required_permission: 'website.view',
          status: 'active',
        },
        {
          key: 'brochure',
          name: 'Brochure',
          required_permission: 'brochure.view',
          status: 'active',
        },
        {
          key: 'client_portal',
          name: 'Portal',
          required_permission: 'brochure.view',
          status: 'active',
        },
      ]).map((item) => item.key),
    ).toEqual(['brochure']);
  });
  it('hides inactive module definitions', () => {
    expect(
      moduleNavigation(context, [
        {
          key: 'brochure',
          name: 'Brochure',
          required_permission: 'brochure.view',
          status: 'inactive',
        },
      ]),
    ).toEqual([]);
  });
});
