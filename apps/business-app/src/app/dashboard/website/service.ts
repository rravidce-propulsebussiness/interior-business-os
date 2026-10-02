import 'server-only';
import { createHmac } from 'node:crypto';
import {
  activeOrganization,
  pageServices,
  serverServices,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { DomainError } from '@business-os/shared';
import { createWebsiteRepository } from '@business-os/database/website';
export async function websiteServices(
  permission = 'website.view',
  page = false,
) {
  const s = await (page ? pageServices() : serverServices());
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  await s.authorization.requirePermission(context.organizationId, permission, {
    moduleKey: 'website',
  });
  return {
    ...s,
    context,
    website: createWebsiteRepository(s.client, context.organizationId),
    allowed: (permission: string) =>
      canAccess(context, {
        organizationId: context.organizationId,
        permission,
        moduleKey: 'website',
      }),
  };
}
export function signWebsite(payload: Record<string, unknown>) {
  const secret = process.env.WEBSITE_BUILD_SIGNING_KEY;
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new Error('Website signing is not configured');
  const body = JSON.stringify({
    ...payload,
    keyId: process.env.WEBSITE_BUILD_KEY_ID ?? 'primary',
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  });
  return {
    body,
    signature: createHmac('sha256', secret).update(body).digest('hex'),
  };
}
