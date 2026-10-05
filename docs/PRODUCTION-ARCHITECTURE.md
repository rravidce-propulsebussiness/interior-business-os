# Production architecture

Phase 11 hardens the existing modular monolith. No new business modules or hosted deployment were created. Production release status is **NO-GO** until [hosted acceptance](HOSTED-ACCEPTANCE.md) is complete.

Three independent Next.js Node 24 services serve platform administration, authenticated business operations and public published websites/brochures. Supabase supplies Auth, PostgREST and PostgreSQL. The current website/brochure media adapter stores private bytes in PostgreSQL; no external object bucket is configured. Browser/server application clients use publishable credentials and caller identity; no application service-role key is required. PostgreSQL RLS, checked RPCs, permissions and entitlements remain authoritative. Public capability routes use constrained anonymous projections rather than privileged reads.

The separate automation worker runs with a restricted PostgreSQL login belonging to `business_os_worker`, without superuser/BYPASSRLS. It claims bounded work and email leases, calls canonical operations, retries within the existing idempotency window and stops claiming work on shutdown. The continuously running worker performs scheduling; no new public cron endpoint is introduced. Resend is the existing business email transport; Supabase Auth SMTP is separately configured. Neither is verified against a real provider.

## Environment isolation

Use separate development, staging and production Supabase projects, storage, Auth redirect allowlists, signing keys, email identities and domains. Store credentials in the hosting provider's environment-scoped secret store. Restrict production account/project access to operators; development and CI identities must have no production access. `APP_ENV` and `SUPABASE_ENVIRONMENT` must agree in hosted apps. These declarations validate configuration but cannot prove project ownership or prevent a deliberately mislabeled credential; verify project IDs with the operator's deployment inventory.

The checked-in Supabase configuration and all demo seeds are development-only. Do not apply development seeds, test bootstrap SQL or `db:verify` to a hosted project. Standard CI needs no hosted credentials.

## Environment inventory

| Variables                                                                          | Exposure                              | Timing                                             | Consumers                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                 | PUBLIC                                | BUILD_TIME and RUNTIME; build for each environment | Three apps; browser code may receive only public credentials                             |
| `APP_ENV`, `SUPABASE_ENVIRONMENT`, `APP_ORIGIN`, `LOG_LEVEL`                       | SERVER_ONLY, not secrets              | RUNTIME; also validated during configured builds   | Deployment launcher and application registration                                         |
| `QUOTATION_SIGNING_KEY`                                                            | SECRET                                | RUNTIME                                            | Business App; 64 lowercase hex; matching private database key                            |
| `WEBSITE_BUILD_SIGNING_KEY`, `BROCHURE_BUILD_SIGNING_KEY`                          | SECRET                                | RUNTIME                                            | Business App only; matching private database key configuration                           |
| `WEBSITE_BUILD_KEY_ID`, `BROCHURE_BUILD_KEY_ID`                                    | SERVER_ONLY                           | RUNTIME                                            | Business App; existing primary/fallback semantics retained                               |
| `BROCHURE_PUBLIC_ORIGIN`                                                           | SERVER_ONLY configuration, public URL | RUNTIME                                            | Business App and Websites; bare HTTPS hosted origin                                      |
| `AUTOMATION_DATABASE_URL`                                                          | SECRET                                | RUNTIME                                            | Worker only; restricted login, TLS `sslmode=verify-full` in hosted deployments           |
| `AUTOMATION_EMAIL_API_KEY`                                                         | SECRET                                | RUNTIME                                            | Worker only                                                                              |
| `AUTOMATION_EMAIL_FROM`, `AUTOMATION_WORKER_NAME`                                  | SERVER_ONLY                           | RUNTIME                                            | Worker only                                                                              |
| `PSQL_PATH`                                                                        | SERVER_ONLY tooling                   | RUNTIME                                            | Worker/database scripts; install PostgreSQL client on worker image                       |
| `TEST_DATABASE_URL`, `ALLOW_TEST_DATABASE_RESET`, `ALLOW_AUTOMATION_RACE_FIXTURES` | Test-only; database URL is SECRET     | Test runtime                                       | Disposable local/CI databases only                                                       |
| `E2E_*`                                                                            | Test-only; passwords are SECRET       | Test runtime                                       | Playwright opt-ins and port/origin settings; forbidden in hosted application deployments |
| `PLATFORM_ADMIN_ORIGIN`, `BUSINESS_APP_ORIGIN`, `WEBSITES_ORIGIN`                  | Operator configuration                | Smoke runtime                                      | Read-only hosted smoke script                                                            |
| `NODE_ENV`, `CI`                                                                   | Runtime/toolchain configuration       | BUILD_TIME and RUNTIME                             | Framework and verification tooling                                                       |

Auth SMTP, OAuth, DNS and backup-provider credentials belong to their provider control planes. No payment gateway or separate object-store adapter is configured. Do not invent credentials or add public-prefixed secrets.

`AUTH_RECOVERY_SIGNING_KEY` is SECRET, RUNTIME only, consumed separately by each admin application. It must be 64 lowercase hexadecimal characters and is mandatory in hosted admin startup. It is independent of Supabase credentials and the document signing keys. Use a distinct key per application/environment; no recovery secret goes to Websites or browser code. AUTH-RECOVERY.md specifies the email template and allowlist dependencies.

## Deployment contract

Install with `pnpm install --frozen-lockfile`; build each environment with its own public Supabase values. Launch supported hosted processes from the repository using `pnpm production:start business-app --hostname 0.0.0.0 --port 3001` (equivalent service names for other apps) or `pnpm production:start worker`. `node scripts/start-service.mjs <service> --check` validates without launching. Missing/invalid settings report variable names, never values. Application registration also validates whenever `APP_ENV` is supplied. Bare `next start` without `APP_ENV` retains local shell behavior and is **not** the production deployment contract.

The worker image needs Node, the PostgreSQL client and trusted CA roots. Business App needs Playwright Chromium and its OS libraries for PDFs; image processing needs Sharp's supported native runtime. The apps bind according to the launcher arguments; TLS termination and hostname forwarding must be configured at a trusted reverse proxy. No hosting platform, domains or runtime image has yet been selected or deployed.

## Connections and capacity

Apps use Supabase HTTP APIs, not direct PostgreSQL pools. The worker opens one bounded psql process at a time, with 10-second connection, 45-second statement and 5-second lock timeouts. Use a verified direct or session-pooler endpoint compatible with psql and the deployment's network; test TLS and restricted-role identity before release. Migration owners are separate from worker identities. Do not use a migration login in application processes.

PDF concurrency is capped at two per process, network requests are aborted, JavaScript is disabled and browser lifetime is bounded to 30 seconds. Replica count multiplies that capacity and resource usage. Measure peak memory/CPU before setting replica limits. Storage usage, provider email limits, database connection allowance, real user concurrency and production latency are unknown; operator-approved budgets and load measurements are release prerequisites, not invented SLAs.

Admin HTML is dynamic with per-request nonce CSP and private/no-store responses. Public delivery retains the established structured rendering and route-specific cache behavior; its current CSP allows inline scripts for Next.js hydration, an explicit residual risk. Browser source maps remain disabled by Next's default. Scan source and build artifacts before release. Store server artifacts privately.

Official references: [Next.js nonce CSP](https://nextjs.org/docs/app/guides/content-security-policy), [Supabase backups](https://supabase.com/docs/guides/platform/backups). Current private bytea asset bytes are in the database and must be validated during database restore. If an external Storage adapter is later configured, its object bytes require separate backup/restore.
