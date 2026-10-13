import 'server-only';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';

type OAuthIdentity = {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
};
type AuthenticatedUser = {
  id: string;
  email?: string;
  identities?: OAuthIdentity[];
};
type CompanyResult =
  | { status: 'created' | 'updated' | 'matched'; organizationId: string }
  | { status: 'needs_selection' | 'review_required' }
  | { status: 'no_company' }
  | { status: 'unavailable' };

const USERINFO = 'https://propulsetechnologies.online/api/oauth/userinfo';

function normalizeProfile(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null;
  const data = value as Record<string, unknown>;
  const str = (input: unknown, max: number) =>
    typeof input === 'string' ? input.trim().slice(0, max) : '';
  const id = str(data.source_id, 18);
  const name = str(data.name, 200);
  if (!/^[1-9][0-9]{0,17}$/.test(id) || name.length < 2) return null;

  const rawServices = Array.isArray(data.services)
    ? data.services.slice(0, 30)
    : [];
  const services = rawServices
    .filter((item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
    )
    .map((item) => ({
      industry: str(item.industry, 100),
      service: str(item.service, 100),
    }));
  const rawLocations = Array.isArray(data.locations)
    ? data.locations.slice(0, 30)
    : [];
  const locations = rawLocations
    .filter((item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
    )
    .map((item) => ({
      city: str(item.city, 100),
      state: str(item.state, 100),
    }));

  const industryKeys = new Set<string>();
  for (const service of services) {
    const industry = service.industry.toLowerCase();
    if (/construction|civil|building/.test(industry))
      industryKeys.add('construction');
    if (/interior|design/.test(industry)) industryKeys.add('interior');
  }
  return {
    source_id: id,
    name,
    description: str(data.description, 2000),
    phone: str(data.phone, 40),
    services,
    locations,
    industryKeys: [...industryKeys],
  };
}

/**
 * OAuth callback only. The upstream bearer token comes from the Supabase
 * provider authorization-code exchange, never from a browser-supplied field.
 * The privileged RPC also checks auth.identities and the verified email.
 */
export async function syncPropulseCompany(
  user: AuthenticatedUser,
  providerToken: string | null | undefined,
): Promise<CompanyResult> {
  if (process.env.PROPULSE_OAUTH_ENABLED !== 'true')
    return { status: 'unavailable' };
  if (!providerToken || providerToken.length > 2048)
    return { status: 'unavailable' };

  try {
    const response = await fetch(USERINFO, {
      headers: {
        Authorization: 'Bearer ' + providerToken,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { status: 'unavailable' };
    const payloadText = await response.text();
    if (payloadText.length > 20000) return { status: 'unavailable' };
    const payload: unknown = JSON.parse(payloadText);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return { status: 'unavailable' };
    const data = payload as Record<string, unknown>;
    const subject = typeof data.sub === 'string' ? data.sub : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    if (
      !/^propulse:[1-9][0-9]{0,17}$/.test(subject) ||
      data.email_verified !== true ||
      !email ||
      email.toLowerCase() !== user.email?.trim().toLowerCase() ||
      !user.identities?.some(
        (identity) =>
          identity.provider === 'custom:propulse-business' &&
          identity.identity_data?.sub === subject,
      )
    )
      return { status: 'unavailable' };
    if (data.company == null) return { status: 'no_company' };
    const profile = normalizeProfile(data.company);
    if (!profile) return { status: 'unavailable' };

    // Elevated key is server-only; the Postgres RPC is *not* executable by
    // ordinary authenticated tenants. The SQL verifies exact OAuth identity,
    // verified email, existing-owner roles and source ID uniqueness again.
    const admin = createOwnerProvisioningDatabase();
    const { data: result, error } = await admin.rpc('propulse_company_sync', {
      p_user_id: user.id,
      p_subject: subject,
      p_email: email,
      p_profile: profile,
    });
    if (error || !result || typeof result !== 'object' || Array.isArray(result))
      return { status: 'unavailable' };
    const value = result as Record<string, unknown>;
    if (value.status === 'needs_selection' || value.status === 'review_required')
      return { status: value.status };
    if (
      ['created', 'updated', 'matched'].includes(String(value.status)) &&
      typeof value.organizationId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(value.organizationId)
    ) {
      return {
        status: value.status as 'created' | 'updated' | 'matched',
        organizationId: value.organizationId,
      };
    }
  } catch {
    // No token, company data or keys are returned in redirects, errors or logs.
  }
  return { status: 'unavailable' };
}
