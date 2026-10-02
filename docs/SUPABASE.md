# Supabase and local PostgreSQL setup

## Phase 5 acceptance

Apply the nine additive `20261002000000`–`20261002000800` migrations after Phase 4. Optionally run `seed-finance.sql` after the existing development/catalog/commercial/CRM seeds. Regenerate database types and verify drift. Existing `QUOTATION_SIGNING_KEY` server configuration and matching private database key are also required for catalog-backed change orders; never expose that key in a public environment variable.

The local PostgreSQL harness tests Auth UID claims and actual RLS/RPC transactions, but does not replace hosted Supabase Auth, PostgREST or deployed PDF verification. Hosted finance acceptance uses `E2E_LIVE_FINANCE=true`, `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_SALES_EMAIL`, `E2E_SALES_PASSWORD`, optional `E2E_FINANCE_ORG_ID` and `E2E_ACCEPTED_REVISION_ID`. Supply a newly accepted disposable quotation worth at least 100 with no existing financial history, plus active payment methods and Billing/Projects entitlements. The test creates persistent commercial documents; use a dedicated development tenant and a fresh accepted revision on each run.

Run `pnpm test:e2e --project=business-app tests/e2e/live-finance.spec.ts` against production builds configured for that development Supabase project. Validate Owner workflow, Sales denial, Accountant duties, a second tenant, revocation, catalog pricing and historical PDFs before production rollout. Missing credentials are reported as explicit skips, never replaced by fake browser authentication. See PHASE5-VERIFICATION.md for actual local results and outstanding hosted checks.

## Runtime configuration

Configure the same Supabase development project in apps/business-app/.env.local and apps/platform-admin/.env.local:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Both values are intentionally public. Never put a secret/service-role key in these variables. No application service-role credential is required: requests carry the user's session JWT; platform RPCs check a separate permission graph before performing control-plane mutations. No PostgreSQL connection string belongs in a browser or application .env.local.

The public landing pages and credential-free smoke tests run without these settings. Dashboards redirect to sign-in; the login screen explains missing setup. Once configured, invalid connection settings are errors, not a demo-mode authorization bypass.

## Local full Supabase stack

Install the Supabase CLI and Docker separately. From packages/database:

```sh
supabase start
supabase db reset
supabase status
```

The checked-in supabase/config.toml exposes only public through the Data API. private is not an exposed schema. db reset applies the unchanged baseline plus the four Phase 1 migrations and the development plan seed. Reset only your disposable local development stack. Copy its URL and publishable/legacy anon key into the publishable-key variable above. The full Docker stack was not run in this environment; local SQL verification instead uses PostgreSQL directly.

## Hosted development project

1. Create a development Supabase project in your chosen region. Keep development, staging and production separate.
2. Use the CLI from packages/database to link that development project and review/apply migrations (`supabase db push`). Alternatively run the migration files in timestamp order through an operator SQL connection. Do not run tests/bootstrap.sql on Supabase: its Auth table/function are only test shims.
3. Run supabase/seed.sql only for development packaging. It creates Starter, Professional and Business module bundles with no prices. Production packaging and private.provisioning_defaults must be configured deliberately.
4. Set Auth Site URL to the business-app origin (locally http://localhost:3001). Allow exact callback URLs for both administration app origins. The local config contains localhost examples; production requires HTTPS origins.
5. Enable email confirmation, password strength/rate limits and appropriate SMTP. Configure the confirmation email template to link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`, as in supabase/templates/confirmation.html. The callback accepts email confirmation or a PKCE code and redirects only to /dashboard. It never accepts an arbitrary return URL.
6. Start the apps, create/confirm a business account and sign in. Supabase's auth.users trigger creates its profile. Public metadata can supply a bounded display name, never permissions or membership.
7. Bootstrap the initial platform operator using an explicit SQL administrator connection after creating/confirming that account. Resolve the known profile ID and desired platform role ID and insert into platform_user_roles inside a transaction. The audited assignment is a deliberate operator action; ordinary signup never grants platform access. For a disposable demo, seed-users.sql performs this for the documented test email.
8. Run the opt-in live browser tests and Supabase security advisors before promoting the environment. The local SQL harness does not verify GoTrue, PostgREST, SMTP, refresh tokens, hosted grants/default privileges or your deployed origin configuration.

Session handling follows the [Supabase SSR client pattern](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and uses [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) for verified identity. Proxy refreshes cookies; page/actions and database policies enforce authorization. Session-bearing responses are private/no-store, and protected dashboards are dynamically rendered. Server actions use Next.js origin protection; production proxy/allowed-origin settings must match your deployment.

## Demo accounts and seed

Create and confirm these accounts in your disposable Supabase Auth project, choosing local passwords outside source control:

| Email                       | Assignment                                 |
| --------------------------- | ------------------------------------------ |
| platform.admin@example.test | platform_super_admin; no tenant membership |
| owner@example.test          | Demo Interiors Owner                       |
| sales@example.test          | Demo Interiors Sales                       |
| designer@example.test       | Demo Interiors Interior Designer           |
| accountant@example.test     | Demo Interiors Accountant                  |

For .test addresses, use the local mail catcher or manually confirm users through the development Auth dashboard. No password is checked in. After seed.sql, run supabase/seed-users.sql through your development SQL administrator connection. It refuses missing Auth accounts and unexpected demo ownership. It creates one Demo Interiors organization, Main Branch, Interior Design association, four active memberships, ten role templates and a Professional development plan. Brochure and Client Portal are enabled by that plan; Website is not. Repeated execution preserves existing fixture rows without duplicates. The demo organization ID is dddddddd-dddd-4ddd-8ddd-dddddddddddd.

Business role defaults are Owner, Admin, Branch Manager, Sales, Interior Designer, Estimator, Accountant, Purchase Manager, Project Manager and Site Supervisor. Only data mappings determine authority. Owner protection is a lifecycle invariant, not a blanket permission bypass. Custom roles are supported through save_role; there is intentionally no full role-management UI.

Membership invitations currently target an existing profile UUID through invite_member. accept_membership requires that exact authenticated user; administrators can change membership status through the checked RPC. This phase does not send invitation email or implement invite-by-email onboarding. No messaging action was performed during development.

## SQL-only verification without Docker

Use PostgreSQL 17 or newer with psql and create a NEW, disposable database. Never point this harness at Supabase or an existing application database. It creates a minimal auth.users/auth.uid fixture and anon/authenticated roles and refuses any existing public/auth tables. Application grants are tested under SET ROLE authenticated with simulated JWT subject; only fixture setup runs as postgres.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/new_test_database'
$env:ALLOW_TEST_DATABASE_RESET = 'yes'
pnpm db:verify
pnpm db:types:check
pnpm db:test
```

Set PSQL_PATH if psql is not at the default PostgreSQL 18 Windows location or on Unix PATH. The verification script never drops schemas/databases. Database tests wrap fixtures in a rollback transaction. Development seed checks then leave only explicitly disposable demo fixtures. Reuse that database with db:test; create a fresh database for another db:verify run. PostgreSQL roles are cluster-wide, so use a dedicated test cluster rather than shared production infrastructure.

`pnpm db:types` introspects the applied public table columns, defaults, nullability, foreign keys and RPC signatures and writes packages/database/src/generated/database.types.ts. `pnpm db:types:check` detects drift without writing. The generator supports the types currently in this schema; extend it when adding enums, domains, views or new PostgreSQL type families. It does not invent handwritten schema types or require Docker. Reviewed migrations are the source of truth.

## Browser verification

Phase 2 setup: apply the four additive catalog migrations after the Phase 1 chain. After the optional demo-user seed, run supabase/seed-catalog.sql in the disposable development project. It copies versioned Interior starter definitions into Demo Interiors, without creating users or sending messages. Existing tenant records are not overwritten. To regenerate this SQL after reviewing starter data changes, run `node packages/database/scripts/generate-catalog-seed.mjs`; verify with `pnpm db:seed:check`.

The SQL verifier now applies the complete migration chain, repeats catalog seeding and runs tests/catalog.sql in addition to the unchanged Phase 1 suite. With TEST_DATABASE_URL pointing to that initialized disposable database, run `pnpm exec vitest run packages/database/src/catalog.integration.test.ts` to load an actual RLS-filtered snapshot and price it through the TypeScript engine. Without this variable the integration test is explicitly skipped; ordinary pure tests remain credential-free. This SQL harness is still not live Supabase Auth/PostgREST.

The opt-in live catalog test uses the Owner credentials to create uniquely keyed test categories/items/questions/options/modifiers/books/rates and run a preview. It deliberately leaves that configuration in the disposable project. An additional read-only Designer test uses E2E_DESIGNER_EMAIL and E2E_DESIGNER_PASSWORD. It confirms catalog edit controls and pricing routes are unavailable. Do not use production accounts. These flows require live credentials and are reported separately from anonymous browser checks.

Build all apps first. Without credentials, `pnpm test:e2e` checks public shells, login validation, redirects, anonymous module API denial and 404 pages. Hosted tests are explicitly skipped.

To opt into authenticated checks, configure the app environments, prepare the demo seed, and set E2E_LIVE_SUPABASE=true, E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD in your shell. The tests sign in, inspect Demo Interiors, reject its disabled Website page/API and verify that a business Owner cannot enter Platform Admin. These tests do not create Auth users or send messages. Traces are disabled for the credential-bearing tests. Do not use production accounts.

RLS/function security follows the [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). SQL integration tests cover application-role access, but deployment-specific advisors, backup/restore drills, monitoring, MFA policy and full hosted session lifecycle checks remain launch gates.

## Phase 3 setup

Apply the new 20260930 migrations after the preserved Phase 1/2 migrations. For the disposable demo, apply seed-commercial.sql after seed-users.sql and seed-catalog.sql. Configure the server-only quotation signing key as described in QUOTATIONS.md; no service-role key is needed by the application. Install matching Playwright Chromium for PDF generation.

Live quotation acceptance is opt-in with E2E_LIVE_QUOTATIONS=true, E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD, alongside configured Supabase URL/publishable key, confirmed demo Owner, seeds and matching app/database signing keys. This test creates quotations in the selected development organization. Tracing is disabled for credential-bearing tests. Local PostgreSQL assertions do not validate hosted Auth, PostgREST or deployed browser availability.

## Phase 4 acceptance

Apply the additive CRM migrations and optional seed-crm.sql after the earlier seeds. Run the live Phase 1-3 flags and E2E_LIVE_CRM=true with E2E_SALES_EMAIL/E2E_SALES_PASSWORD for a confirmed disposable development account. This account needs organization-wide Sales capabilities plus explicit quotation.issue permission for the complete issue/share scenario, and CRM, Projects, Quotation, Catalog and Pricing entitlements. Configure the existing server/database quotation signing key and install Chromium. The test disables traces, screenshots and video around bearer links.

No hosted credentials were present during this implementation's preflight. Local PostgreSQL uses the existing Auth test shim; it is not GoTrue/JWT/PostgREST acceptance. Public sharing deployment additionally requires path-token redaction in access/APM logs, SQL parameter/body redaction, and ingress limits for invalid-token attempts. Database-backed valid-link limits are shared across instances.

## Phase 6 hosted acceptance

Apply all 20261003 execution migrations in order after Phase 5. Optionally apply seed-execution.sql after the existing demo seeds. Install matching Playwright Chromium in the PDF runtime. Enable Projects, Purchasing and Vendors for the disposable organization and assign the appropriate action grants; Billing is needed only to show commercial values.

Set E2E_LIVE_EXECUTION=true, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD and E2E_EXECUTION_CONTRACT_ID to opt into live-execution.spec.ts. The contract must be a fresh accepted development contract with one physical scope item. E2E_EXECUTION_ORG_ID can select the organization. The test creates masters, an estimate, two vendor quotes, split POs and a receipt; it does not send email or create Auth accounts. Credential-bearing traces/screenshots/video are disabled.

No hosted credentials were available during Phase 6 local verification. Before production acceptance, run real Auth/PostgREST owner workflows plus Site/Designer/Sales and foreign-tenant denials, entitlement revocation and deployed PDF download checks. Local PostgreSQL claim shims are not hosted session validation. See PHASE6-VERIFICATION.md for completed local evidence.
