import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerDatabase } from '@business-os/database/server';
import { authCallback } from '@business-os/auth/callback';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  // Email confirmation and other existing auth callbacks keep their normal
  // semantics. Only Supabase-verified ProPulse OAuth logins sync companies.
  if (!code) return authCallback(request);

  const cookieStore = await cookies();
  const isPropulseLogin =
    cookieStore.get('business-os-propulse-signin')?.value === '1';
  cookieStore.delete('business-os-propulse-signin');

  const client = await createServerDatabase();
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(new URL('/login?confirmation=failed', url.origin));
  }

  if (isPropulseLogin && data.session.provider_token) {
    try {
      const response = await fetch(
        'https://propulsetechnologies.online/api/oauth/userinfo',
        {
          headers: {
            authorization: 'Bearer ' + data.session.provider_token,
            accept: 'application/json',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(7000),
        },
      );
      if (response.ok) {
        const profile: unknown = await response.json();
        if (
          profile &&
          typeof profile === 'object' &&
          'email_verified' in profile &&
          profile.email_verified === true &&
          'sub' in profile &&
          typeof profile.sub === 'string' &&
          /^propulse:[0-9]{1,19}$/.test(profile.sub)
        ) {
          // Security-definer RPC binds this ProPulse subject to the currently
          // authenticated Supabase identity before it creates/updates a tenant.
          // A provider email or display name alone never grants company access.
          const { data: linked, error: syncError } = await client.rpc(
            'company_propulse_sync',
            { p_input: profile },
          );
          if (!syncError && linked && typeof linked === 'object' &&
              !Array.isArray(linked) && linked.status === 'approved' &&
              typeof linked.organizationId === 'string') {
            const { data: membership, error: membershipError } = await client
              .from('organization_memberships')
              .select('organization_id')
              .eq('organization_id', linked.organizationId)
              .eq('user_id', data.user.id)
              .eq('status', 'active')
              .maybeSingle();
            if (!membershipError && membership) {
              cookieStore.set('business-os-organization', linked.organizationId, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 30,
              });
              if (process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED === 'true') {
                // New tenant's canonical slug is loaded from a membership-
                // guarded database read, never from provider profile input.
                const { data: org } = await client.from('organizations')
                  .select('slug').eq('id', linked.organizationId).maybeSingle();
                if (org?.slug) {
                  cookieStore.set('business-os-workspace-route', org.slug, {
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: process.env.NODE_ENV === 'production',
                    path: '/',
                    maxAge: 60 * 60 * 24 * 30,
                  });
                }
              }
            }
          }
        }
      }
    } catch {
      // A temporary ProPulse outage never discards a valid Supabase session.
      // Users can retry synchronization by choosing Continue with ProPulse.
    }
  }
  return NextResponse.redirect(new URL('/dashboard', url.origin));
}
