import { serverServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';

// Read-only, self-scoped diagnostics; never return tokens, emails or role IDs.
// A successful Next.js build does not guarantee Hostinger's runtime or login
// session is connected to the expected production Supabase project.
export const dynamic = 'force-dynamic';

const required = [
  'platform.access',
  'platform.organizations.view',
  'platform.catalog.view',
] as const;
const headers = { 'Cache-Control': 'private, no-store' };

function configuredProject() {
  try {
    const hostname = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    ).hostname;
    return hostname.endsWith('.supabase.co')
      ? hostname.slice(0, -'.supabase.co'.length)
      : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const { authorization } = await serverServices();
    await authorization.requireAuthenticatedUser();
    const missingPermissions: string[] = [];

    for (const permission of required) {
      try {
        await authorization.requirePlatformPermission(permission);
      } catch (error) {
        if (error instanceof DomainError && error.code === 'FORBIDDEN') {
          missingPermissions.push(permission);
          continue;
        }
        throw error;
      }
    }

    const dashboardAccess = missingPermissions.length === 0;
    return Response.json(
      {
        authenticated: true,
        dashboardAccess,
        missingPermissions,
        configuredProject: configuredProject(),
      },
      { status: dashboardAccess ? 200 : 403, headers },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'UNAUTHENTICATED')
      return Response.json(
        { authenticated: false, dashboardAccess: false },
        { status: 401, headers },
      );

    // Don't disclose database/RPC or environment exception details.
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers },
    );
  }
}
