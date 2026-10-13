# Business OS sign-in providers

The Business App login at `/login` supports three entry points: Supabase email/password, Google via Supabase Auth, and an enterprise ProPulse SSO entry point. Neither Google OAuth nor ProPulse SSO automatically creates company memberships or grants roles.

## Google OAuth

1. In Google Cloud, configure an OAuth 2.0 Web client and the authorized redirect URI `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`.
2. Enable **Google** in the **same Supabase project** used for Business OS (Authentication → Providers → Google). Store the Google client ID/secret there, not in frontend code.
3. Configure the Supabase redirect allowlist to include `https://sghomesinterior.in/auth/callback` (plus intentional staging origins). Set `APP_ORIGIN=https://sghomesinterior.in` and use the correct Supabase public project URL and publishable key in Business App.
   **Hostinger:** configure `APP_ORIGIN=https://sghomesinterior.in` in the Business App runtime. The OAuth start and callback routes now use the canonical public origin even if a reverse proxy exposes `0.0.0.0:3000`; a missing or invalid production origin falls back to this known production domain. Staging requires an explicit HTTPS `APP_ORIGIN`. Do not add `http://0.0.0.0:3000` to Supabase redirect allowlists.
4. `GET /auth/google` initiates server-side PKCE with `signInWithOAuth`. The existing `/auth/callback` exchanges the code for a secure Supabase session and redirects to `/dashboard`. Existing role checks decide whether an owner, employee, or platform admin may access their workspace.

Never redirect to user-supplied `next` URLs or return raw provider access tokens to the browser.

## Continue with ProPulse — custom OAuth2, no enterprise SAML

ProPulse at `https://propulsetechnologies.online` uses its existing secure session cookie to authenticate account holders. It now exposes a **separate OAuth2 authorization-code + S256 PKCE provider** for Business OS, without sharing passwords, JWTs, or company roles.

Business OS uses Supabase **custom OAuth/OIDC providers** (`custom:propulse-business`; available on Supabase Free) and its existing `/auth/callback` PKCE session exchange.

Both apps are **disabled by default** and need a paired rollout:

1. Deploy the original ProPulse code + SQL migration `20261012_propulse_business_os_oauth.sql`. Do not backfill email verification.
2. Create one shared random **client ID + strong client secret**. In ProPulse backend set:
   `PROPULSE_OAUTH_CLIENT_ID`, `PROPULSE_OAUTH_CLIENT_SECRET`, and
   `PROPULSE_OAUTH_REDIRECT_URI=https://wqkjzuqiarjyoimrzalk.supabase.co/auth/v1/callback`.
3. In the Business OS Supabase project `wqkjzuqiarjyoimrzalk`, Authentication → Providers → New Provider → Manual Configuration (OAuth2):
   - Identifier: `custom:propulse-business`
   - Client ID and secret: the same values as ProPulse server config
   - Authorization URL: `https://propulsetechnologies.online/api/oauth/authorize`
   - Token URL: `https://propulsetechnologies.online/api/oauth/token`
   - UserInfo URL: `https://propulsetechnologies.online/api/oauth/userinfo`
   - Scopes: `openid email profile`; PKCE enabled
   - Ensure the callback from Supabase matches the ProPulse `PROPULSE_OAUTH_REDIRECT_URI` value **exactly**.
4. Verify Supabase Redirect URLs include `https://sghomesinterior.in/auth/callback`. Keep `APP_ORIGIN=https://sghomesinterior.in`.
5. Perform a disposable-account end-to-end test, then set **both** ProPulse backend and Business OS server-only `PROPULSE_OAUTH_ENABLED=true`.

Existing ProPulse **password-only** signups do not prove email ownership. Such users must verify their email by following a password-reset email link, or authenticate via a verified Google account, before ProPulse can supply their identity to Business OS. Existing password-only email records are **never marked verified automatically**. Supabase will create/link its own identity using verified OAuth claims, while the Business OS authorization layer continues to require existing active company membership.

Keep the toggle disabled until deployed and tested; while disabled, `/auth/propulse` shows a safe activation message. This integration is not a way to provision new organization owners or platform administrators.

For the provider implementation and full rollout checklist, see `docs/PROPULSE-OAUTH-BUSINESS-OS.md` in the `propulse-business` repository.

## Smoke tests

- Anonymous `/login`: two provider buttons, email/password login, show/hide password, recovery and signup links.
- Unconfigured ProPulse IdP: no external SSO or session; a safe `/login?provider_error=propulse` redirect.
- Google (configured): check the provider consent and `/auth/callback`; verify the session, then company-specific permission restrictions.
- After Google/ProPulse sign-in, if no Business OS company membership exists, show the existing no-workspace state. Authentication **never** assigns owner roles by default.
- Verified existing email/password account should still sign in and sign out.

No database migration or production secret changes are part of the login UI redesign.
