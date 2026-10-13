# ProPulse professional business -> Business OS company

A ProPulse professional must sign in using **Continue with ProPulse** at
`https://sghomesinterior.in/login`. This is the sole automatic bootstrap
mechanism. Logging in with unrelated email/password or Google does not silently
attach a ProPulse company.

## Trusted data flow

1. ProPulse authenticates the business owner, with verified email and active
   ProPulse user status, via short-lived OAuth 2 authorization code + PKCE.
2. Business OS exchanges the callback code with Supabase Auth. The callback
   uses the server-received upstream `session.provider_token` to fetch
   `https://propulsetechnologies.online/api/oauth/userinfo` over HTTPS.
   Neither account IDs nor company details are accepted from browser forms.
3. It checks the exact returned `sub=propulse:<numeric user ID>`,
   `email_verified=true`, the Supabase authenticated email and its actual
   `custom:propulse-business` identity.
4. Only when a professional business profile is returned does the Business OS
   backend call the **service-role-only** `propulse_company_sync` RPC. SQL
   rechecks the exact Supabase Auth custom identity, verified email and active
   profile; a tenant or anonymous user cannot execute the provisioning RPC.
5. The stable ProPulse business **profile ID** (different from the ProPulse
   login user ID) links to one Business OS tenant. Repeat logins update the
   same organization and its private source snapshot, not duplicate it.
6. Existing owned workspaces are reused only if the authenticated user is an
   active Owner and the business name uniquely matches. If the user already
   owns a different company, syncing returns `needs_selection` and leaves
   existing companies untouched rather than guessing ownership.
7. A new company uses existing canonical role templates and the testing
   promotion (90 days). Company permissions are never platform admin rights.

Only the ProPulse company name, industry memberships and the private imported
snapshot (phone, description, services, locations) are synced. A user's
tenant billing, tax settings, custom domains, plans, and manually added
industries are **not overwritten**.

## Deployment order

1. Merge the Business OS code and run all checks on its pull request.
2. Apply `20261014000000_propulse_company_owner_sync.sql` to the **correct**
   live Business OS Supabase project (interior-business-os). Never apply to
   ProPulse, Tbot or the similarly named staging database. Ensure the actual
   Supabase `auth.identities` table includes the custom provider.
3. Deploy the Business OS build **after** its DB migration; set server-only
   `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` on Hostinger.
   Never embed it in NEXT_PUBLIC or the browser.
4. Ensure the existing ProPulse OAuth integration is fully activated:
   ProPulse provider backend, Supabase custom OAuth provider, the same exact
   Supabase callback, and `PROPULSE_OAUTH_ENABLED=true` on the Business OS
   server. Enable flags only after provider acceptance with a disposable
   verified account; don't guess secret values.
5. Confirm the new build is deployed (Hostinger may require a manual publish).
   Test sign-in twice, name update on re-login, an unrelated owner denied, and
   regular ProPulse users redirected without an owner grant.

If Supabase doesn't return `provider_token` from the callback, the sign-in
still completes but company sync fails closed; investigate provider integration
and don't substitute user-editable metadata or email-only matching as evidence.

Company settings at `/dashboard/company/settings` displays the last imported
details and a **Refresh from ProPulse** action, which starts a new secure
OAuth authorization. This is login-time synchronization, **not** a background
continuous profile mirror.
