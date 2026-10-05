# Password recovery acceptance

Both admin applications use the existing Supabase Auth provider. Configure an independent `AUTH_RECOVERY_SIGNING_KEY` (32 random bytes expressed as 64 hexadecimal characters) and the exact HTTPS `APP_ORIGIN` through the server secret store. No signing key belongs in a public build variable. Allowlist each application's `/auth/recovery` URL in Supabase Auth. Install `packages/database/supabase/templates/recovery.html` as the recovery email template; its TokenHash/RedirectTo link is required for this server-side flow. Configure and verify Auth SMTP separately from the business email transport.

The request action returns the same message for missing accounts, successful requests, rate limits and provider failures. Supabase owns request rate limits; verify the project's actual limits and CAPTCHA/edge protection before release. The application does not claim a distributed limiter. Opening an email link stores an encrypted, origin-bound, ten-minute HttpOnly pending token and removes the query from the URL. It does not consume the provider token, establish an authenticated session or change a password. Password submission validates matching 12–128 character inputs, verifies the recovery-purpose token with Supabase, updates only the verified user's password, globally revokes refresh sessions, clears local Auth/recovery/organization cookies and requires a new login. Tokens, passwords, email addresses and provider bodies are excluded from operational logs.

Global sign-out cannot immediately revoke already issued access JWTs; those remain valid until expiry. Set and verify an appropriate provider JWT lifetime and session policy. A revocation failure after a password change is explicitly reported as an incomplete operation, never success. A used provider token cannot be retried; request a fresh link after any incomplete operation. The local cookie lifetime does not extend provider token validity. Invalid form input does not consume the token.

## Reproduce local browser acceptance

Run `pnpm test:recovery`. The runner builds two isolated `.next-recovery` artifacts with synthetic public provider inputs and launches a loopback-only protocol fixture. Its private control credential is generated per run. The fixture has no connection to hosted Supabase or email. Hosted deployment validation rejects its E2E variables. Standard production builds use `.next` and must be rebuilt with the intended environment inputs. Never deploy fixture artifacts.

The suite exercises request/email-link handoff, expired sessions, scanner-safe opening, encrypted cookies, valid reset, old-password rejection, new-password login, global refresh revocation, invalid/expired/wrong-purpose/used tokens, anonymous denial, uniform unknown-account/rate-limit/outage responses and revocation failure. Unit tests separately check origin/key binding, tampering, expiration, verified user identity and provider exceptions. This is LOCAL protocol/UI acceptance, not a real provider or inbox result.

## Required hosted acceptance — BLOCKED

Preconditions: disposable staging project, two test identities, exact application origin and template installed, verified Auth SMTP sender, controlled inbox, operator-approved session/rate settings. Never use a customer's account. Record metadata only; disable screenshots/traces on token/password pages and redact proxy query logs for `/auth/recovery`.

1. Request reset for an existing and nonexistent address; compare public messages and confirm the known account's real inbox receipt, sender and HTTPS origin.
2. Open the received link twice without submission; confirm no password change or authenticated session and no token in the resulting URL/browser storage.
3. Submit a new password; verify redirect to login, old-password rejection, new-password login and refresh-session revocation on a second browser. Record the access-token lifetime limitation explicitly.
4. Reopen the used link, use a genuinely expired provider token, alter its hash and attempt an email-purpose token. Every attempt must fail to update a password or gain tenant/platform access.
5. Test another logged-in identity, mismatched form inputs, anonymous submission, cross-origin Server Action rejection and simultaneous submissions; exactly one valid provider token consumption may succeed.
6. Exercise configured rate limits and a safe staging-only SMTP/Auth outage. Restore settings, request a new token, confirm inbox receipt and successful reset. Preserve original configuration in the secret store; never log a link or password.

Expected: all checks pass with provider/inbox evidence and no unintended role/tenant changes. Rollback: restore the previous reviewed template/allowlist/configuration and compatible application artifact; pause exposed recovery if verification fails. Verification: repeat the known/unknown request and valid/used-token tests after restoration. Current hosted result: BLOCKED; no real message or hosted reset is asserted.

References: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [reset email](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [global sign-out](https://supabase.com/docs/reference/javascript/auth-signout).
