import 'server-only';
import { NextResponse } from 'next/server';
import {
  createServerDatabase,
  isSupabaseConfigured,
} from '@business-os/database/server';

/** Begin provider authentication using server-side PKCE.
 * No client-supplied redirect URL is accepted. Supabase authenticates identity;
 * Business OS still enforces active company membership after callback.
 */
export async function providerStart(
  request: Request,
  provider: 'google' | 'propulse',
) {
  const origin = process.env.APP_ORIGIN?.trim() || new URL(request.url).origin;
  const fallback = new URL('/login', origin);
  fallback.searchParams.set('provider_error', 'unavailable');

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(fallback, 303);
  }

  // The main ProPulse platform currently uses a separate account system.
  // This may be enabled only after it is connected as a verified Supabase
  // enterprise IdP. It is never safe to infer identity from an email alone.
  const ssoProviderId = process.env.PROPULSE_SSO_PROVIDER_ID?.trim();
  if (
    provider === 'propulse' &&
    (!ssoProviderId || !/^[a-f0-9-]{36}$/i.test(ssoProviderId))
  ) {
    fallback.searchParams.set('provider_error', 'propulse');
    return NextResponse.redirect(fallback, 303);
  }

  try {
    const client = await createServerDatabase();
    const redirectTo = new URL('/auth/callback', origin).toString();
    const response =
      provider === 'google'
        ? await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo },
          })
        : await client.auth.signInWithSSO({
            providerId: ssoProviderId!,
            options: { redirectTo },
          });
    if (response.error || !response.data.url) {
      fallback.searchParams.set('provider_error', provider);
      return NextResponse.redirect(fallback, 303);
    }
    // Supabase returns a trusted OAuth/SAML authorization URL. Do not allow
    // arbitrary next/redirect_uri query params or use user metadata for access.
    const target = new URL(response.data.url);
    if (
      target.protocol !== 'https:' &&
      !(
        process.env.NODE_ENV !== 'production' && target.hostname === 'localhost'
      )
    ) {
      fallback.searchParams.set('provider_error', provider);
      return NextResponse.redirect(fallback, 303);
    }
    return NextResponse.redirect(target, 303);
  } catch {
    fallback.searchParams.set('provider_error', provider);
    return NextResponse.redirect(fallback, 303);
  }
}
