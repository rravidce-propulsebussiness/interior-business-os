# Business OS sign-in providers

The Business App login at `/login` supports three entry points: Supabase email/password, Google via Supabase Auth, and an enterprise ProPulse SSO entry point. Neither Google OAuth nor ProPulse SSO automatically creates company memberships or grants roles.

## Google OAuth

1. In Google Cloud, configure an OAuth 2.0 Web client and the authorized redirect URI `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`.
2. Enable **Google** in the **same Supabase project** used for Business OS (Authentication → Providers → Google). Store the Google client ID/secret there, not in frontend code.
3. Configure the Supabase redirect allowlist to include `https://sghomesinterior.in/auth/callback` (plus intentional staging origins). Set `APP_ORIGIN=https://sghomesinterior.in` and use the correct Supabase public project URL and publishable key in Business App.
4. `GET /auth/google` initiates server-side PKCE with `signInWithOAuth`. The existing `/auth/callback` exchanges the code for a secure Supabase session and redirects to `/dashboard`. Existing role checks decide whether an owner, employee, or platform admin may access their workspace.

Never redirect to user-supplied `next` URLs or return raw provider access tokens to the browser.

## ProPulse Business single sign-on

The legacy ProPulse Business application at `propulsetechnologies.online` has its **own** local/JWT login system. It is **not** currently an enterprise IdP for the Business OS Supabase project. Two independent login systems cannot be linked just because an email address matches, and ProPulse passwords must never be copied or sent to Business OS.

The `Continue with ProPulse` UI is present as requested. The `/auth/propulse` start route safely redirects back to the login page with a configuration message until an approved federation is set up.

To enable it, first implement/deploy a standards-compliant identity provider or broker that authenticates the ProPulse session and issues trusted, cryptographically verified SAML assertions for Supabase SSO. Configure that IdP in the **Business OS Supabase project**, record its enterprise provider UUID, and set **server-only** `PROPULSE_SSO_PROVIDER_ID=<uuid>` in Hostinger. The UUID must refer to a trusted, audited IdP for ProPulse identities—not an arbitrary provider. The route then uses `signInWithSSO({providerId, options:{redirectTo}})` and the same server-side callback.

Do not enable ProPulse SSO until the underlying federation and identity verification are deployed and tested. The public button is intentionally fail-closed while unconfigured; no account is created, linked, or assigned to a company by this route.

## Smoke tests

- Anonymous `/login`: two provider buttons, email/password login, show/hide password, recovery and signup links.
- Unconfigured ProPulse IdP: no external SSO or session; a safe `/login?provider_error=propulse` redirect.
- Google (configured): check the provider consent and `/auth/callback`; verify the session, then company-specific permission restrictions.
- After Google/ProPulse sign-in, if no Business OS company membership exists, show the existing no-workspace state. Authentication **never** assigns owner roles by default.
- Verified existing email/password account should still sign in and sign out.

No database migration or production secret changes are part of the login UI redesign.
