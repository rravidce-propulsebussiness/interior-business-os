import { NextResponse } from 'next/server';
import { publicAuthOrigin } from '@business-os/auth/origin';
import { resolveLoginDestination } from '@business-os/auth/login-destination';
import { createServerDatabase } from '@business-os/database/server';
import { syncCompanyFromPropulse } from './propulse-company-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Reverse proxies can expose an internal listener (0.0.0.0:3000).
  // Only redirect browsers to the configured public HTTPS origin.
  const origin = publicAuthOrigin(request.url);
  const code = url.searchParams.get('code');
  const hash = url.searchParams.get('token_hash');
  const clientAudience = url.searchParams.get('audience') === 'client';
  const client = await createServerDatabase();
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.session?.user) {
      // Determine the landing area from trusted project sharing and active
      // organization membership. Google/ProPulse logins use the same rules as
      // password login, including clients signing in from the main /login.
      const destination = await resolveLoginDestination(client, {
        userId: data.session.user.id,
        preferClient: clientAudience,
      });
      if (destination === '/client')
        return NextResponse.redirect(new URL(destination, origin));
      // Session login succeeds even if the external company API is unavailable.
      // A subsequent "Continue with ProPulse" can retry safe, idempotent sync.
      try {
        await syncCompanyFromPropulse(
          data.session.user.id,
          data.session.provider_token,
        );
      } catch {
        // Do not expose provider tokens, company information or backend
        // errors to the browser. Sign-in is separate from company sync.
      }
      return NextResponse.redirect(new URL(destination, origin));
    }
  }
  // Preserve email confirmation behavior, without trusting arbitrary OTP types.
  if (hash && url.searchParams.get('type') === 'email') {
    const { data: verified, error } = await client.auth.verifyOtp({
      token_hash: hash,
      type: 'email',
    });
    if (!error) {
      const user = verified.user ?? (await client.auth.getUser()).data.user;
      if (!user)
        return NextResponse.redirect(new URL('/login?confirmation=failed', origin));
      const destination = await resolveLoginDestination(client, {
        userId: user.id,
        preferClient: clientAudience,
      });
      return NextResponse.redirect(new URL(destination, origin));
    }
  }
  return NextResponse.redirect(
    new URL(clientAudience ? '/client/login?provider_error=callback' : '/login?confirmation=failed', origin),
  );
}
