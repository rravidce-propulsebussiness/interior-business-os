# Database design and migration standards

Phase 11 adds only the data-free invoker `deployment_readiness()` RPC. Its anonymous execution grant exposes no tenant table or privileged mutation. The fresh verifier protects all 89 Phase 0–9 migration hashes and tests readiness execution/grants separately. See [Phase 11 verification](PHASE11-VERIFICATION.md) for local versus hosted acceptance.

Phase 10 adds automation settings/rules/immutable revisions, reference-only events, executions/jobs, notifications/preferences, templates/consents/email delivery metadata and immutable report snapshots. Private registries, scheduler cursors, worker heartbeats and transient email payloads support the shared worker. All new public tenant tables force RLS and use composite tenant references. Canonical CRM, quotation, finance, procurement and execution tables remain the source of truth. Read-only work/report RPCs aggregate those sources. See [security](AUTOMATION-SECURITY.md) and [verification](PHASE10-VERIFICATION.md).

## Phase 7 local implementation

Twenty-one additive operations migrations follow Phase 6. They add planning, project assignments, immutable receipt-lot stock movements, issue requests, vendor execution profiles, work orders/measurements, inspections, snags, handover and events. Runtime-tested corrections fix plan alias resolution, customer display-name lookup, purchase-cost linkage, nullable draft approval quantities and measurement aliases. All new tenant tables force RLS. `test-operations.mjs` reuses the existing execution fixture transaction and appends workflow/security checks without changing the original tests. See PHASE7-VERIFICATION.md for actual evidence and gaps.

## Phase 5 additions

Nine additive migrations `20261002000000` through `20261002000800` add finance schema, integrity helpers, contract/schedule operations, invoice operations, payment operations, change-order operations, bounded reads, accepted-scope lookup and source/date constraints. Earlier migrations remain unchanged.

New public tables: `organization_billing_settings`, `payment_methods`, `tax_codes`, `contracts`, `payment_schedules`, `payment_schedule_items`, `payment_requests`, `invoices`, `invoice_items`, `payments`, `payment_allocations`, `receipts`, `change_orders`, `change_order_items`. Private organization/document/year counters live in `finance_sequences`. All 14 public tables force tenant RLS and deny direct application DML. Checked RPCs perform writes, organization locks serialize financial state, and database triggers preserve issued/approved history. Composite tenant foreign keys enforce linkage; immutable snapshots store decimal text and safe document details. See CONTRACTS.md, BILLING.md and TAX-ARCHITECTURE.md.

`seed-finance.sql` is optional repeatable demo configuration, applied twice by `db:verify`. It creates offline payment methods, billing details and illustrative tax codes without fabricating acceptance or received money. `tests/finance.sql` runs in a rolled-back transaction. The concurrency integration test uses disposable persistent fixtures and requires `TEST_DATABASE_URL`. Generated types are derived from the applied schema.

## Phase 4 additions

Additive migrations `20261001000000` through `20261001000500` add `lead_sources`, `crm_pipeline_stages`, `crm_lost_reasons`, `crm_requirement_fields`, `leads`, `lead_activities`, `lead_followups`, `site_visits`, `quotation_share_links` and `quotation_customer_responses`. All ten tables enable and force RLS. Application roles have scoped reads and checked RPC writes. Composite foreign keys bind assignments, conversions, visits and commercial records to their organization.

Private tables hold organization/year lead counters, share-token hashes and distributed per-link rate-limit buckets. Activities and responses have append-only triggers. Existing quotation tables and Phase 1–3 migrations are preserved. `db:verify` applies the complete chain to an empty database, repeats demo seeds and runs CRM SQL assertions alongside earlier suites. `db:test` repeats all four SQL suites; `db:seed:check` checks catalog and CRM generators.

Phase 1 adds four migrations after the unchanged Phase 0 no-op baseline. Runtime adapters use Supabase; sensitive multi-step mutations use checked PostgreSQL RPC functions. Local PostgreSQL RLS tests are implemented. Hosted Supabase Auth/PostgREST verification is a distinct deployment check; see PHASE1-VERIFICATION.md.

## Implemented Phase 1 relationships

- auth.users has one profiles row, created by an insert trigger and backfilled for existing users. No password storage exists outside Supabase Auth. Only the display name is copied from metadata; metadata never assigns authority.
- profiles joins organizations through organization_memberships. A user can have multiple organizations but only one membership per organization. Membership branch_id is optional and limits all of that membership's grants when set.
- organizations has many branches, roles, memberships, organization_industries and organization_entitlements, and one optional plan. Composite tenant foreign keys constrain branch, membership and role references.
- membership_roles assigns multiple roles with optional branch scope. role_permissions maps organization-owned roles to the shared organization permission catalog. Organization scope covers branches; branch scope cannot grant organization-wide actions.
- platform_user_roles and platform_role_permissions join separate platform_roles to profiles and platform-scoped permissions. A platform assignment grants no organization membership. Platform organization/entitlement views are explicitly permitted control-plane projections; team/branch data remain tenant-only.
- industries and organization_industries support multiple packs. modules, plans and plan_modules configure packaging without prices. organization_entitlements contains one override per organization/module/source with enablement, time window and JSON configuration.
- audit_logs records important mutations through database triggers in the same transaction. Only allowlisted status/identifier metadata is recorded. Normal roles cannot insert/update/delete audit rows.
- private.role_templates and private.role_template_permissions supply ten copied business-role defaults. private.provisioning_defaults optionally chooses the plan for new organizations. These are not exposed through the Data API.

Public tables: profiles, organizations, branches, organization_memberships, roles, permissions, role_permissions, membership_roles, platform_roles, platform_user_roles, platform_role_permissions, industries, organization_industries, modules, plans, plan_modules, organization_entitlements, audit_logs.

Dates are timestamptz. Mutable public records have created_at/updated_at; audit events only have created_at. UUIDv3 namespaced seed IDs and fixed demo IDs are stable; live records default to gen_random_uuid(). Currency and country are explicit three/two-letter codes with UTC as the timezone default. The app validates IANA timezones, and provisioning also verifies pg_timezone_names. Locale lists and jurisdiction-specific rules are later work.

## Tenant topology

Phase 2 adds four additive migrations (`20260929000000` through `20260929000300`) without rewriting Phase 1. New tenant tables: catalog_categories, catalog_items, catalog_item_attributes, catalog_attribute_options, price_books, price_book_items, pricing_modifiers and pricing_costs. Global units and measurement_methods are read-only reference catalogs with no tenant pricing. Item defaults are price_book_items rows with a null price_book_id; selling rates are deliberately not duplicated on catalog_items.

Composite foreign keys enforce tenant and item ownership. Stable keys are unique within their logical scopes. All ten new tables force RLS; no direct application writes are granted. save_catalog_entity permits only a closed entity/column set, serializes on the organization, validates optimistic versions and checks complete dependency graphs/rate intervals before commit. set_rate_status performs audited, version-checked soft disable/reactivation. catalog_snapshot is STABLE and SECURITY INVOKER, preserving RLS and one consistent database snapshot.

Money is stored as validated decimal text to preserve exact JSON values through PostgREST, not SQL float or JavaScript Number. Date windows are finite and half-open. Active defaults are unique per organization/currency/nullable branch regardless of dates (a deliberately stricter rule than nonoverlapping default windows). Serialized writes reject overlapping active rate intervals. New rate revisions preserve old monetary values and close only the old end date. Cost changes require a new rate revision, preserving previous cost records. No hard-delete API exists.

Pricing audit entries contain bounded before/after rates, IDs, conditions and version metadata, not free-form text or secrets. Their policies require the underlying catalog/pricing access; cost audit entries also require quotation.view_internal_cost. Additive migration and security tests include all Phase 1 assertions unchanged.

Use Supabase PostgreSQL and Supabase Auth identities. organizations is the tenant root. memberships joins auth.users to organizations with active/suspended status; branches belongs to organizations. Users may have multiple memberships. Session tenant selection must be checked against current active membership. Do not store authorization solely in long-lived JWT metadata.

Every business-owned table has a non-null organization_id, UUID primary key, created_at and updated_at timestamps. Add created_by/updated_by when actor attribution is meaningful. Scope uniqueness to organization_id (for example an invoice number). Use UNIQUE (organization_id, id) and composite foreign keys (organization_id, parent_id) to reject cross-tenant parent references. A branch reference uses (organization_id, branch_id), never an unconstrained branch_id. Index tenant IDs and query access paths. Platform catalog tables have no tenant ID; explicitly document each exception. Prefer restrictive deletion and retention rules for financial and audit data.

## Future business tables (not implemented)

| Area                     | Planned records                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Commercial control plane | subscriptions, offers, feature_flags and platform_settings; reuse existing modules/plans/industries    |
| Quotations               | quotations, quotation_revisions, quotation_lines, selected_attributes, immutable accepted snapshots    |
| Execution                | projects, material_estimates, purchase_orders, consumption_entries; separate from quotation quantities |
| Website                  | sites, pages, document_versions, publications, verified_domains, design_tokens                         |

Attribute definitions include type, validation, question label, required status and customer visibility. Options and modifiers are tenant-owned versioned configuration. Quotation snapshots preserve chosen labels/options, quantity unit, currency, rate, modifier order, tax/discount basis and rounding version. Keep internal cost out of customer projections. Store amounts in deliberate numeric precision or integer minor units; never floating-point SQL types for money. Custom formulas require a bounded, allowlisted expression evaluator rather than eval.

## RLS and data access requirements

Enable and force RLS on business tables. Revoke default access, then grant minimum operations. Define SELECT/DELETE USING and INSERT WITH CHECK; UPDATE requires both. Check active membership, granular permission, branch restrictions and relevant entitlement. Policies must prevent changing organization_id to another tenant. Migration owners and service-role credentials bypass normal RLS: never use them for tenant request queries.

Membership helpers must avoid recursive RLS. If SECURITY DEFINER is necessary, use a fixed empty search_path, fully qualified objects, narrow ownership, revoked PUBLIC execution and reviewed explicit grants. Do not accept client-set custom session variables as proof of tenant identity. A tenant filter alone is insufficient.

Storage is private by default, with organization-prefixed object keys and equivalent bucket/object policies. Signed URL issuance is authorized and short-lived. Public websites receive a deliberately limited published projection; anonymous readers cannot query drafts, internal prices or tenant business tables. Background jobs and caches carry validated organization context. Resolve custom domains through verified ownership and never trust arbitrary Host headers as authorization.

## Migration workflow

SQL lives in packages/database/supabase/migrations; names use UTC timestamps plus a description. Never edit an applied migration. Use expand/migrate/contract changes, explicit constraints and transaction boundaries where supported. Review lock impact and destructive operations; rehearse restore/forward-fix procedures. Generate Supabase types after schema changes into packages/database/src/generated and review the diff. Do not manually fabricate generated types.

With a separately installed Supabase CLI and Docker, from packages/database run `supabase start`, then `supabase db reset`; configuration is checked in. For the local SQL harness and generated types use the root db:verify/db:types scripts described in SUPABASE.md. The harness Auth shim is for disposable PostgreSQL only, never hosted Supabase. Do not link or push to production as part of local development.

All public Phase 1 tables enable and force RLS. Authenticated callers have SELECT only, constrained by policies; no direct table mutations are granted. Therefore there are no permissive INSERT/UPDATE policies. Transactional RPCs implement the approved mutations, separately authorize the caller and use composite constraints, row locks and audit triggers. Other data operations fail closed. Future tables that allow direct writes will require both USING and WITH CHECK rules.

Security-definer functions are owned by the migration owner (Supabase postgres/local test postgres), whose bypass authority avoids recursion. All use empty search_path and qualified objects. Only four scoped private predicate functions are executable by authenticated users for policies. Unscoped helpers, seed utilities and trigger functions are not callable. Reviewed public RPCs are granted only to authenticated, never anon. PostgreSQL tests check both RLS flags and function privileges.

Owner lifecycle: mutations lock the organization row, verify current permissions, then preserve at least one active, unbranched owner membership. Deferred constraint triggers also enforce the invariant at transaction completion. Protected Owner role permissions cannot be edited by save_role. A business Admin cannot assign/remove the Owner role. Platform role mutations serialize and preserve an active role-management administrator. Privileged SQL maintenance remains outside normal application authority and must preserve these invariants.

Before any data-backed feature ships, add database integration tests using two tenants, multiple branches, anonymous/authenticated sessions, suspended members and insufficient grants. Test SELECT/INSERT/UPDATE/DELETE, ID spoofing, cross-tenant foreign keys, changed tenant IDs, entitlement revocation, private storage and published-only access. Run tests as application roles, not an RLS-bypassing database owner. Define backup retention, restoration drills, pooling, audit retention and regional residency before production launch.

## Phase 3 commercial schema

Five additive migrations dated 20260930 introduce customers, customer_contacts, projects, project_areas, organization_quotation_settings, quotations, quotation_revisions, quotation_items and quotation_item_costs. Composite tenant/parent foreign keys prevent cross-organization links. Private number counters, signing keys and replay receipts are inaccessible to application roles. All nine public tables force RLS and expose SELECT only; master and quotation mutations use checked RPCs. Revision/line triggers independently reject frozen content changes, including privileged accidental writes. Quote aggregates are exact numeric sums of attested line snapshots. The canonical catalog pricing algorithm remains TypeScript.

The commercial seed follows seed-users.sql and seed-catalog.sql. Disposable verification applies all migrations, repeats all seeds and runs Phase 1, Phase 2 and Phase 3 SQL security assertions. Vitest database integration additionally exercises the canonical engine, attestation, historical price changes and independent-session races.

## Phase 6 execution schema

Eighteen additive migrations, 20261003000000 through 20261003001700, add 31 public tables for material/vendor configuration, recipes, estimate revisions and costs, requisitions and source allocations, RFQs, vendor quotes, POs and append-only receipts. The last table stores protected immutable approved-estimate documents. Every table forces RLS; authenticated roles receive SELECT only and mutations use checked RPCs. Cost tables have distinct grants from quantity tables. Composite organization/parent foreign keys protect traceability.

The optional seed-execution.sql follows commercial and finance seeds and is repeatable. It creates only illustrative masters/rates/recipes, not approved estimates or procurement transactions. Fresh verification applies 47 total migrations, repeats seeds and runs 463 assertions, including 92 execution assertions. Independent session races run in the Vitest integration suite. See PHASE6-VERIFICATION.md.

## Phase 8 Website module

See [Website architecture](WEBSITE-ARCHITECTURE.md), [builder](WEBSITE-BUILDER.md), [security and permissions](WEBSITE-SECURITY.md) and [verification](PHASE8-VERIFICATION.md). Website is optional, uses separate immutable public snapshots and canonical CRM enquiries, and does not introduce Phase 9.

## Phase 9 brochure persistence

Nine additive `20261006000000`�`20261006000800` migrations introduce `brochures`, immutable `brochure_versions`, `marketing_kits`, immutable `brochure_events`, platform `brochure_plan_limits` and private PDF/metric/form-limit tables. Existing `website_assets` and `private.website_asset_data` also serve organization marketing media; Website reads remain scoped to Website-owned assets. Tenant tables force RLS, raw payload columns have no direct grants and checked RPCs enforce independent Brochure entitlement and permissions.

Publication uses organization locking, optimistic draft revisions, expiring signed document/PDF digests and one transaction for historical bytes and public pointer. Historical restore preserves old rows. Existing canonical CRM leads/activities store enquiries. Database verification includes the brochure fixture after every preceding phase. See [security](BROCHURE-SECURITY.md) and [verification](PHASE9-VERIFICATION.md).
