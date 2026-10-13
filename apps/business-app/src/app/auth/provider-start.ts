import 'server-only';
import { NextResponse } from 'next/server';
import { publicAuthOrigin } from '@business-os/auth/origin';
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
  const origin = publicAuthOrigin(request.url);
  const fallback = new URL('/login', origin);
  fallback.searchParams.set('provider_error', 'unavailable');

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(fallback, 303);
  }

  // Explicit opt-in: the linked ProPulse application must first expose
  // the verified OAuth2 authorization-code provider, and the Business OS
  // Supabase project must have custom:propulse-business enabled.
  // Until both are configured, never use an untrusted email as identity.
  if (
    provider === 'propulse' &&
    process.env.PROPULSE_OAUTH_ENABLED !== 'true'
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
        : await client.auth.signInWithOAuth({
            provider: 'custom:propulse-business',
            options: { redirectTo },
          });
    if (response.error || !response.data.url) {
      fallback.searchParams.set('provider_error', provider);
      return NextResponse.redirect(fallback, 303);
    }
    // Supabase returns a trusted OAuth authorization URL. Do not allow
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
