import 'server-only';
import type { createServerDatabase } from '@business-os/database/server';
import { chooseLoginDestination, type LoginDestination } from './login-destination-policy';

type AuthClient = Awaited<ReturnType<typeof createServerDatabase>>;

/** Determine the correct landing workspace using trusted database grants.
 * Never use query parameters, Google profile metadata, or a supplied email
 * to grant access. Portal RPC enforces verified email, active project sharing,
 * and project-specific permissions independently.
 */
export async function resolveLoginDestination(
  client: AuthClient,
  authenticatedUserId: string,
  options: { preferClient?: boolean } = {},
): Promise<LoginDestination> {
  const preferClient = options.preferClient === true;
  try {
    const [memberships, portal] = await Promise.all([
      client.from('organization_memberships')
        .select('id')
        .eq('user_id', authenticatedUserId)
        .eq('status', 'active')
        .limit(1),
      (client.rpc.bind(client) as unknown as (
        name: string,
      ) => Promise<{ data: unknown; error: unknown }>)('client_portal_projects'),
    ]);
    return chooseLoginDestination({
      hasActiveCompanyMembership: !memberships.error &&
        Array.isArray(memberships.data) && memberships.data.length > 0,
      hasSharedClientProjects: !portal.error &&
        Array.isArray(portal.data) && portal.data.length > 0,
      preferClient,
    });
  } catch {
    // Authentication succeeded. Permission lookup failure should not trigger
    // another login. Each destination enforces its own authorization checks.
    return preferClient ? '/client' : '/dashboard';
  }
}
