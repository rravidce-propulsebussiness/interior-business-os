import { z } from 'zod';
import { DomainError, idSchema } from '@business-os/shared';
import { canAccess } from './index';

const contextSchema = z.object({
  userId: z.uuid(),
  organizationId: z.uuid(),
  membershipId: z.uuid(),
  membershipStatus: z.literal('active'),
  roles: z.array(
    z.object({ id: z.uuid(), name: z.string(), branchId: z.uuid().nullable() }),
  ),
  grants: z.array(
    z.object({
      permission: z.string(),
      scope: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('organization') }),
        z.object({ kind: z.literal('branch'), branchId: z.uuid() }),
      ]),
    }),
  ),
  entitlements: z.array(z.string()),
});
const platformSchema = z.object({
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export interface AuthorizationPort {
  user(): Promise<{ id: string; email?: string | undefined } | null>;
  context(id: string): Promise<unknown>;
  platformContext(): Promise<unknown>;
  hasEntitlement(id: string, key: string): Promise<boolean>;
}
export function createAuthorization(port: AuthorizationPort) {
  async function requireAuthenticatedUser() {
    const user = await port.user();
    if (!user) throw new DomainError('UNAUTHENTICATED');
    return user;
  }
  async function requireOrganizationMembership(id: string) {
    const user = await requireAuthenticatedUser();
    if (!idSchema.safeParse(id).success) throw new DomainError('FORBIDDEN');
    const context = contextSchema.parse(await port.context(id));
    if (context.userId !== user.id || context.organizationId !== id)
      throw new DomainError('FORBIDDEN');
    return context;
  }
  async function requirePermission(
    id: string,
    permission: string,
    options: { moduleKey?: string; branchId?: string } = {},
  ) {
    const context = await requireOrganizationMembership(id);
    if (!canAccess(context, { organizationId: id, permission, ...options }))
      throw new DomainError('FORBIDDEN');
    return context;
  }
  async function requireEntitlement(id: string, key: string) {
    await requireOrganizationMembership(id);
    if (!(await port.hasEntitlement(id, key)))
      throw new DomainError('FORBIDDEN');
  }
  async function requirePlatformPermission(permission: string) {
    await requireAuthenticatedUser();
    const context = platformSchema.parse(await port.platformContext());
    if (!context.permissions.includes(permission))
      throw new DomainError('FORBIDDEN');
    return context;
  }
  async function requirePlatformRole(role: string) {
    await requireAuthenticatedUser();
    const context = platformSchema.parse(await port.platformContext());
    if (!context.roles.includes(role)) throw new DomainError('FORBIDDEN');
    return context;
  }
  async function validateOrganizationSwitch(id: string) {
    await requireOrganizationMembership(id);
    return id;
  }
  return {
    requireAuthenticatedUser,
    requireOrganizationMembership,
    requirePermission,
    requireEntitlement,
    requirePlatformPermission,
    requirePlatformRole,
    validateOrganizationSwitch,
  };
}
