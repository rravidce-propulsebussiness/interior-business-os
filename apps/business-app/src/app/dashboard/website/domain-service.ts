import 'server-only';
import { serverServices } from '@business-os/auth/server';
import { idSchema } from '@business-os/shared';
import { websiteServices } from './service';

/** An explicit platform operation retains the current actor; it never sets tenant membership. */
export async function domainServices(organizationId?: string) {
  if (!organizationId) return websiteServices('website.domain.manage');
  const s = await serverServices();
  await s.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  await s.authorization.requirePlatformPermission(
    'platform.organizations.manage',
  );
  await s.authorization.requirePlatformPermission('platform.catalog.view');
  return { ...s, context: { organizationId: idSchema.parse(organizationId) } };
}
