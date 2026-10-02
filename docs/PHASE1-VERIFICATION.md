# Phase 1 implementation and verification

This report covers the Phase 1 extension of the existing Phase 0 workspace. All three apps and eight packages remain in place. No CRM, customers, catalog items, quotations, projects, billing/payment processing, vendors, website builder or brochure builder was implemented.

## Implemented

- Supabase browser/server clients, cookie-refresh proxy, sign-in, registration, confirmation callback, sign-out and safe organization preference switching. Identity is verified through Auth; profile/membership/status/permission decisions come from PostgreSQL rather than auth metadata.
- A single shared authorization service built around the original canAccess policy. Helpers: requireAuthenticatedUser, requireOrganizationMembership, requirePermission, requireEntitlement, requirePlatformPermission, requirePlatformRole and validateOrganizationSwitch. moduleNavigation derives links from the same policy and persisted module definitions.
- Validated server-only repositories and transactional RPCs for organization creation, branches, existing-user invitations/acceptance, membership status, role definition/assignment, organization status/plan, entitlement overrides and platform role assignment. No ORM or privileged runtime database key was added.
- Automatic profiles, multiple organization memberships, branch-scoped multi-role grants, last-owner protection, separate platform roles, configurable industry/module/plan data, time-bounded entitlements and transactional append-only audit events.
- Minimal business dashboard for organization selection, roles, effective permissions, enabled modules, branches and authorized team inspection. Minimal platform dashboard for organizations, organization detail, modules, plans and safe status/entitlement changes. Actual module pages remain authorization-check placeholders.

## Schema and migrations

The unchanged baseline is followed by:

1. 20260928000000_identity_tenancy.sql — tables, indexes, foreign keys, profile/audit/owner triggers, RLS predicates and policies.
2. 20260928000100_authorized_operations.sql — checked transactional operations and context/entitlement RPCs.
3. 20260928000200_foundation_catalog.sql — stable UUID permission/module/industry catalogs and default role templates.
4. 20260928000300_audit_target_metadata.sql — retain affected membership and bounded entitlement metadata in audit events.

Public tables: profiles, organizations, branches, organization_memberships, roles, permissions, role_permissions, membership_roles, platform_roles, platform_user_roles, platform_role_permissions, industries, organization_industries, modules, plans, plan_modules, organization_entitlements, audit_logs. Private configuration tables: role_templates, role_template_permissions, provisioning_defaults.

All 18 public tables enable and force RLS. Application roles have scoped SELECT and reviewed RPC execution, not direct mutation grants. Policies cover self profiles, active organization membership, branch restrictions, team/role visibility, tenant entitlement/audit access and separate platform control-plane reads. Private helper functions avoid policy recursion; unscoped helper execution and anonymous RPC access are revoked. Audit rows cannot be edited by normal application workflows.

Development seeds provide 12 modules; Interior Design active and Construction inactive; 10 business-role defaults; 3 platform roles; Starter/Professional/Business development plans without prices. The opt-in demo seed maps five manually created Auth accounts to Demo Interiors, Main Branch, four business memberships and a separate platform operator. Website, Brochure and Client Portal remain independent.

## Executed checks

Verified locally on 2026-09-28:

| Command                                                     | Actual result                                                                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd install --frozen-lockfile`                        | Passed.                                                                                                                                                                           |
| `pnpm.cmd format` and `pnpm.cmd check`                      | Passed, exit code 0. The check includes formatting, ESLint, strict TypeScript, unit tests, production builds, browser-bundle scan and Playwright.                                 |
| Unit tests within `check`                                   | 31 passed across 4 files.                                                                                                                                                         |
| Production builds within `check`                            | All three Next.js applications passed.                                                                                                                                            |
| Browser-bundle scan within `check`                          | 40 JavaScript files checked; no privileged environment names or harmless server-secret canary found.                                                                              |
| Playwright within `check`                                   | 11 passed, 7 skipped: 5 project-inapplicable cases and 2 live Supabase flows requiring credentials.                                                                               |
| `node packages/database/scripts/verify.mjs`                 | Passed on a new isolated PostgreSQL database: baseline and four migrations applied, development seeds repeated, 80 isolation/security assertions passed, demo seed checks passed. |
| `node packages/database/scripts/test.mjs`                   | Passed again after demo seeding; test fixtures rolled back.                                                                                                                       |
| `node packages/database/scripts/generate-types.mjs --check` | Passed; generated types match the applied schema.                                                                                                                                 |

Database commands used the disposable test connection and explicit reset opt-in documented below. Logs are local ignored artifacts under `.tools/`. The browser-bundle check used a harmless marker, not a real secret. No live integration result is inferred from these checks.

## Confirmed issues fixed during verification

- Deferred owner trigger initially referenced a field absent on the organization table; changed it to resolve the row's identifier through its JSON representation and reran the migrations/tests.
- Entitlement upsert initially had an ambiguous SQL variable; renamed it and verified override writes, precedence and audit creation.
- Deterministic seed UUIDs were normalized to namespaced UUIDv3 so strict application UUID validation accepts them.
- Lint found a reserved module variable, JSX constructed inside a try/catch, and an empty generated argument type; corrected each without disabling rules.
- Rerunning security tests after demo seeding exposed fixture overlap (email and extra platform-admin assignment). Security fixtures now use a separate email and isolate platform assignments inside the rollback-only test transaction, preserving the last-administrator assertion.
- Browser validation tests initially matched both the form alert and Next.js's route announcer. Scoped the assertion to the main landmark; the validation assertion remains intact.
- Final audit review found that deleted role assignments needed the affected membership identifier. Added the fourth migration and two passing assertions for target and entitlement metadata.

## Verification boundaries and remaining setup

The SQL harness runs PostgreSQL 18 on an isolated localhost cluster, applies real migrations and executes access tests as authenticated/anon application roles or explicit privilege checks. Only fixture setup/schema inspection runs as postgres. Its minimal auth.users/auth.uid shim is not Supabase Auth, PostgREST or Storage. Demo Auth rows in that SQL harness have no passwords and are not usable login accounts.

No hosted Supabase credentials were provided, no real users were created, no email was sent, and no hosted database or deployment was changed. Live login, email confirmation, cookie refresh/revocation and the full Supabase API path require the documented test-project setup. The opt-in live browser tests must remain skipped until that setup exists. CI is configured with PostgreSQL 17 but has not run remotely in this session.

Required runtime variables are NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in both administration apps. Rebuild after changing public environment variables. SQL tooling uses a shell-only TEST_DATABASE_URL, ALLOW_TEST_DATABASE_RESET=yes for a new disposable database and optional PSQL_PATH. No runtime service-role key is required. Live browser checks additionally use E2E_LIVE_SUPABASE, E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD.

Manual setup: create a development Supabase project or local CLI/Docker stack, apply migrations, configure Auth origins/email confirmation, create and confirm development accounts, apply development seeds, explicitly bootstrap the platform operator and run live checks. See SUPABASE.md for commands and account names. Do not run the SQL Auth shim on Supabase.

Known scope limits: no invite-by-email delivery or polished team/role editor; no uploads or Storage buckets/policies; no usage-limit enforcement, commercial subscription processing, MFA enrollment UI, password-recovery UI or production monitoring/backup setup. Entitlement configuration stores future limits but does not pretend to enforce unimplemented module quotas. ESLint 9 remains pinned for compatibility with the existing Next.js lint plugins, as documented in Phase 0.

## Review next

Review docs/ARCHITECTURE.md, docs/DATABASE.md, docs/PERMISSIONS.md and docs/SUPABASE.md; the four SQL migrations and database tests; packages/auth/src/service.ts; packages/database/src/repository.ts; and the two dashboard trees. Generated types come from the applied catalog and are checked for drift.

Recommended Phase 2 is the industry-neutral catalog attribute/option model and pure finished-work pricing engine. Decide units, modifier order, monetary rounding, minimum rates and immutable snapshots before implementing that scope. Keep material estimation, CRM, billing and website authoring in later phases.
