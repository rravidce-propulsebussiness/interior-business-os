import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';

const origin = 'https://propulsetechnologies.online';

const companySchema = z.object({
  source_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
  name: z.string().trim().min(2).max(200),
  description: z.string().max(2000),
  phone: z.string().max(40),
  services: z
    .array(
      z.object({
        industry: z.string().max(100),
        service: z.string().max(100),
      }),
    )
    .max(30),
  locations: z
    .array(
      z.object({
        city: z.string().max(100),
        state: z.string().max(100),
      }),
    )
    .max(30),
});
const membershipSchema = z.discriminatedUnion('tier', [
  z.object({ tier: z.literal('none'), expires_at: z.null() }),
  z.object({ tier: z.literal('growth'), expires_at: z.iso.datetime() }),
  z.object({ tier: z.literal('scale'), expires_at: z.iso.datetime() }),
]);
const userInfoSchema = z.object({
  sub: z.string().regex(/^propulse:[1-9][0-9]{0,18}$/),
  email_verified: z.literal(true),
  company: companySchema.nullable(),
  membership: membershipSchema.optional(),
});
const importResultSchema = z.object({
  status: z.enum([
    'created',
    'linked_existing',
    'updated',
    'review_required',
    'owner_limit',
  ]),
  organizationId: z.uuid().optional(),
});

function industryKeys(services: z.infer<typeof companySchema>['services']) {
  const result = new Set<string>();
  for (const service of services) {
    const industry = service.industry.toLowerCase();
    if (industry.includes('construct')) result.add('construction');
    if (industry.includes('interior') || industry.includes('design'))
      result.add('interior');
  }
  return [...result];
}

/**
 * Trust only a freshly exchanged ProPulse provider token, NEVER email,
 * user_metadata or a caller-supplied company ID. Supabase Auth independently
 * attests that the returned subject is linked to the current user.
 *
 * Do not throw into the login path on remote outages. All source data is
 * bounded/validated; the bearer token remains server-side and is not stored.
 */
export async function syncCompanyFromPropulse(
  userId: string,
  providerToken: string | null | undefined,
): Promise<string | null> {
  if (!providerToken || providerToken.length > 4096) return null;
  const admin = createOwnerProvisioningDatabase();
  const { data: account, error: accountError } =
    await admin.auth.admin.getUserById(userId);
  if (accountError || !account.user) return null;

  const identities = account.user.identities ?? [];
  if (
    !identities.some(
      (identity) => identity.provider === 'custom:propulse-business',
    )
  )
    return null;

  const response = await fetch(origin + '/api/oauth/userinfo', {
    headers: { Authorization: 'Bearer ' + providerToken },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const source = userInfoSchema.safeParse(await response.json());
  if (!source.success || !source.data.company) return null;

  const linked = identities.some(
    (identity) =>
      identity.provider === 'custom:propulse-business' &&
      identity.identity_data?.sub === source.data.sub,
  );
  if (!linked) return null;

  const { data, error } = await admin.rpc('propulse_company_import', {
    p_user_id: userId,
    p_subject: source.data.sub,
    p_company: {
      ...source.data.company,
      industries: industryKeys(source.data.company.services),
    },
  });
  if (error) throw new Error('ProPulse company import unavailable');
  const result = importResultSchema.parse(data);
  if (!result.organizationId) return null;

  // Never infer a tier from a role, email, company record or query parameter.
  // Only the access-token-bound provider UserInfo response is authoritative.
  // Legacy ProPulse deployments omit membership; do not grant anything from it.
  if (source.data.membership) {
    const { tier, expires_at } = source.data.membership;
    const synced = await admin.rpc('propulse_membership_sync', {
      p_user_id: userId,
      p_subject: source.data.sub,
      p_organization_id: result.organizationId,
      p_tier: tier,
      ...(expires_at ? { p_expires_at: expires_at } : {}),
    });
    if (synced.error)
      throw new Error('ProPulse membership verification unavailable');
  }
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
  const jar = await cookies();
  jar.set('business-os-organization', result.organizationId, cookieOptions);
  // Routes with tenant prefixes need the database-approved slug, not one
  // supplied by the ProPulse API.
  if (process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED === 'true') {
    const { data: organization } = await admin
      .from('organizations')
      .select('slug')
      .eq('id', result.organizationId)
      .maybeSingle();
    if (organization?.slug) {
      jar.set('business-os-workspace-route', organization.slug, cookieOptions);
    }
  }
  return result.organizationId;
}
