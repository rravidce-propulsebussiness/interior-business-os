import { NextResponse } from 'next/server';
import { createServerDatabase } from '@business-os/database/server';
import { syncCompanyFromPropulse } from './propulse-company-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const hash = url.searchParams.get('token_hash');
  const client = await createServerDatabase();
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.session?.user) {
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
      return NextResponse.redirect(new URL('/dashboard', url.origin));
    }
  }
  // Preserve email confirmation behavior, without trusting arbitrary OTP types.
  if (hash && url.searchParams.get('type') === 'email') {
    const { error } = await client.auth.verifyOtp({
      token_hash: hash,
      type: 'email',
    });
    if (!error) {
      // A verified invited client has no company membership. Their portal is
      // selected by permission-checked RPC, not a caller-controlled redirect.
      const { data: projects, error: portalError } = await client.rpc(
        'client_portal_projects',
      );
      if (!portalError && Array.isArray(projects) && projects.length > 0)
        return NextResponse.redirect(new URL('/client', url.origin));
      return NextResponse.redirect(new URL('/dashboard', url.origin));
    }
  }
  return NextResponse.redirect(
    new URL('/login?confirmation=failed', url.origin),
  );
}
