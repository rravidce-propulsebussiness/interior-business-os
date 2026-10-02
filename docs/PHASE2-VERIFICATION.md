# Phase 2 implementation and verification

Phase 2 extends the existing three apps and eight packages. No CRM, customers, quotations, PDFs, invoices, projects, BOQ, purchases, website builder or client portal was implemented. No production database, deployment or user account was changed.

## Implementation and review map

- packages/quotation-engine/src: Zod configuration/input schemas; exact BigInt rational decimal utility; one deterministic engine; safe measurements, dependencies, date/book resolution, modifier ordering, rounding, minimum metadata, cost estimates and detached JSON snapshots. Meaningful unit tests include Interior and Construction inputs.
- packages/database: four new additive migrations, generated database types, one catalog repository extending the existing Supabase adapter, database security/history tests, actual database-to-engine integration test, repeatable generated Interior seed and seed-drift tooling.
- apps/business-app/src/app/dashboard/catalog: category/item settings, questions/options/defaults, AND conditions, pricing modifiers, default/book rates, internal cost entry and server-backed preview/download. Pricing has book management, revision history, replacement rates and explicit soft disable/reactivation. Direct preview API uses the same authorized service and canonical engine. Existing module routes forward to the implemented screens after authorization.
- packages/industry-interior/src/starter.json: versioned demo data only; five categories, seven items, five Wardrobe questions and thirteen options/modifiers, seven rates and one internal cost. No engine code depends on these labels/prices.
- tests/e2e: anonymous catalog/pricing/API denial plus opt-in live configuration and read-only-user flows. Existing Phase 0/1 tests are preserved.
- README, ARCHITECTURE, DATABASE, PERMISSIONS, ROADMAP, SUPABASE, CATALOG and PRICING-ENGINE document setup, boundaries and chosen rules.

## Database and security

New public tables: units, measurement_methods, catalog_categories, catalog_items, catalog_item_attributes, catalog_attribute_options, price_books, price_book_items, pricing_modifiers and pricing_costs. The first two are global read-only reference definitions; all remaining rows are tenant-owned.

Migrations (existing Phase 1 migrations remain unchanged):

1. 20260929000000_catalog_schema.sql: normalized tables, composite FKs, uniqueness/indexes, decimal constraints and forced RLS.
2. 20260929000100_catalog_operations.sql: checked versioned writes, cycle/reference/interval validation and transactional audit triggers.
3. 20260929000200_catalog_snapshot.sql: one consistent RLS-filtered snapshot, finite dates and explicit version-checked rate status changes.
4. 20260929000300_catalog_audit_access.sql: audit metadata respects catalog/pricing/cost permissions and entitlements.

No second authorization system or privileged runtime key was introduced. Existing membership/RBAC/entitlement predicates guard application services, invoker-rights reads and mutation RPCs. Direct table writes are revoked. Organization locks serialize edits; version checks reject stale writes. Internal cost has separate rows and policy enforcement, including audit access. The complete existing 80-assertion Phase 1 suite is retained.

## Pricing decisions

Pricing resolves explicit book → branch default → organization default → item default; a selected book without an item rate falls back to the item default. Invalid explicit books fail. Windows are [from, until), and overlapping active rates/ambiguous defaults are rejected. Exact decimal strings cross JSON boundaries; BigInt arithmetic handles calculations without floating-point money. Configurable rounding operates on quantity and final amount separately.

Order: effective base rate → per-unit adjustments → quantity × adjusted rate → fixed adjustments → additive percentages on that subtotal → final rounding. Minimum rates produce a warning/threshold, never a silent clamp. Dependencies remove stale hidden answers before modifiers. Immutable rate values and serialized calculation snapshots preserve history; snapshots, not current masters, will be authoritative for future quotations.

## Executed verification

Verified locally on 2026-09-28:

| Command/check                                                                | Actual result                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd install --frozen-lockfile`                                         | Passed; lockfile unchanged by the frozen install.                                                                                                                                |
| `pnpm.cmd check`                                                             | Passed, exit code 0: formatting, ESLint, strict typecheck, tests, all production builds, browser-bundle scan and Playwright.                                                     |
| Vitest within `check`                                                        | 84 passed across 6 files, including the actual database-to-engine integration test with TEST_DATABASE_URL configured.                                                            |
| Next.js production builds                                                    | All three apps passed.                                                                                                                                                           |
| Browser-bundle scan                                                          | 43 JavaScript files checked; no privileged environment names or harmless server-secret canary found.                                                                             |
| Playwright                                                                   | 12 passed, 15 skipped across 27 project-expanded cases. Four skips require live Supabase credentials; eleven are project-inapplicable. No existing test was removed or weakened. |
| `node packages/database/scripts/verify.mjs`                                  | Passed on a clean isolated PostgreSQL 18 database: complete migration chain, repeated development/user/catalog seeds, existing Phase 1 suite and new catalog suite.              |
| `node packages/database/scripts/test.mjs`                                    | Final repeat passed 137 assertions: 80 unchanged Phase 1 assertions and 57 Phase 2 assertions. Fixtures rolled back.                                                             |
| `node packages/database/scripts/generate-types.mjs --check`                  | Passed; generated types match the migrated schema.                                                                                                                               |
| `node packages/database/scripts/generate-catalog-seed.mjs --check`           | Passed; SQL seed matches versioned Interior starter data.                                                                                                                        |
| `pnpm.cmd exec vitest run packages/database/src/catalog.integration.test.ts` | Passed separately, then passed again within the full suite. The actual RLS-filtered Wardrobe seed produces 56 × 2380 = 133280.                                                   |
| `git diff --check`                                                           | Passed; the workspace remains untracked, so this is not a substitute for the full Prettier check.                                                                                |

The clean migration run preceded three additional negative SQL assertions; all 57 final Phase 2 assertions subsequently passed on that initialized schema. Database testing used only the dedicated localhost cluster, port 55432, with the existing test-only Auth shim. Logs are ignored local artifacts under .tools/. The application build used a harmless canary, not a real secret.

Confirmed issues fixed: dependency-validation SQL aliases initially collided with PL/pgSQL variable names; corrected them and reran the chain from a clean database. The first full application run stopped on formatting in the new live browser test; formatting was corrected and the complete suite reran successfully. Review also added audit-price access controls, one consistent catalog snapshot, and explicit stale-version protection for rate status changes. No rule or assertion was weakened to obtain a pass.

## Remaining live checks and scope limits

No live Supabase credentials were supplied. Hosted Auth, cookie lifecycle, PostgREST serialization/grants and authenticated browser configuration flows require the disposable project setup in SUPABASE.md. Local PostgreSQL tests use the existing test-only Auth shim, not a Supabase server. CI is configured but was not run remotely.

Only organization-scoped catalog administration is implemented. Organization-authorized users can configure/preview branch books; branch-only employee workspaces remain future work. No tax/GST, exchange conversion, raw material estimation, rate override/approval workflow, platform starter-catalog editor or arbitrary custom formula editor exists. Select/multi-select options and item/book contexts drive modifiers; other question types store specifications. Changing an existing cost requires a new effective rate revision. Audit records and saved calculation snapshots preserve interpretation of changing master configuration, but historical dates do not reconstruct past labels or modifiers from today's masters.

The configuration screens load the organization's catalog as one snapshot; pagination and incremental item loading are future scale work. No production capacity/backup/restore or full accessibility audit was performed. Exact arithmetic is purpose-built for bounded terminating decimal operations; it is not a general arbitrary-expression or accounting library.

Recommended Phase 3: live Supabase acceptance first, then explicitly scoped quotation aggregates/revisions that persist complete calculation snapshots, customer-safe projections, overrides/approval policy and ownership tests. Keep billing, execution BOQ and builders separate; decide whether CRM/customer onboarding is a separate phase rather than adding it implicitly.
