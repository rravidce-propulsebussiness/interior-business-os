# OpenConstructionERP Integration Assessment

Status: source import completed; architecture assessment in progress.

## Verified import

- Upstream: `datadrivenconstruction/OpenConstructionERP`
- Pinned upstream commit: `2d27b866937ea3bd66d3878707b357a3099ba7fa`
- Imported destination: `vendor/openconstructionerp/`
- Imported files: 15,554
- Destination branch: `integration/full-erp-merge`
- Import commit: `f4c5cd083d849de0a2ee56400cc6f61c8b711945`
- Import workflow: completed successfully; clone, source copy, and commit/push steps all passed.
- Root and backend copies of `LICENSE` and `NOTICE` are retained.

This is a preserved source import. It is not yet a production integration, and no ERP database migrations have been applied to Business OS.

## Runtime boundary

Business OS is a pnpm TypeScript monorepo with Next.js apps and shared packages, backed by Supabase/PostgreSQL.

The imported ERP has its own Python 3.12+ backend project and React/Vite frontend project. Its backend includes Alembic migration configuration and independent runtime/database assumptions. The backend README describes a bundled embedded PostgreSQL first-run experience, while the checked-in Alembic configuration contains a SQLite URL; this discrepancy must be resolved by tracing the actual runtime settings before any deployment or migration work.

Do not combine the two dependency graphs or start the ERP's standalone frontend as the Business OS user interface. Keep the source isolated while the integration boundary is designed.

## Recommended target architecture

1. **Business OS remains the product shell.** Keep Next.js apps, navigation, design system, Supabase identity, organizations, permissions and existing domain packages as the canonical user-facing platform.
2. **ERP capability service is initially isolated.** Run the Python backend as a separately versioned internal service with its own controlled database/schema. Do not expose it publicly or trust its standalone login as Business OS authentication.
3. **Add a typed integration gateway.** Next.js server routes call a server-only adapter. The adapter forwards verified Business OS user and organization context, validates inputs/outputs, applies authorization and records audit events. Never accept organization IDs or role claims from an untrusted browser payload.
4. **Rebuild the ERP experience in the Business OS UI.** Reuse business workflows and algorithms through service APIs where suitable; progressively implement native Next.js screens using the existing UI package. Do not transplant the Vite app wholesale into the production shell.
5. **Keep domain ownership explicit.** Business OS remains authoritative for customers, projects, contracts, quotations, billing, vendors, inventory and organization membership wherever those already exist. ERP modules should add specialist construction-estimating capabilities without creating shadow customer/project/quotation records.
6. **Use an anti-corruption mapping layer.** Map Business OS IDs to ERP IDs through explicit organization-scoped mapping records. Include idempotency, audit history, retry handling and data provenance.
7. **Reuse the existing quotation engine.** Business OS already has a canonical TypeScript/Zod/Decimal quotation engine. Do not create a second source of truth for customer-facing quotation totals. Evaluate ERP BOQ/takeoff outputs as validated inputs to that engine, with parity tests and clear rounding/unit rules.
8. **Review migrations before adoption.** Inventory every ERP model, tenant boundary, user assumption, migration and destructive operation. Never run the complete ERP Alembic history against the Business OS Supabase database. Prefer additive, reviewed integration tables and isolated service storage.
9. **Keep imports and modifications on this branch.** Do not alter production `main` or deployment configuration until build, security, migration, tenancy and workflow tests pass.

## Capability integration order

### Wave 1 — Estimating foundation
- BOQ item structures, units and conversion rules
- Safe formula evaluation and validation
- Resource norms and assemblies
- Quantity takeoff from drawings/PDF/DWG/BIM
- Estimate rollups, cost matching and rate build-ups

### Wave 2 — Cost and project controls
- Cost plans and elemental breakdowns
- Cashflow forecasting and cost control
- Progress measurement and earned-value reporting
- Schedule and risk/contingency calculations

### Wave 3 — Specialist optimization
- Cutting/waste optimization
- Resource planning and rate/index datasets
- Advanced BIM/5D/6D workflows and related integrations

Each capability must have an API contract, organization isolation, authorization policy, data mapping, test fixtures and UI acceptance criteria before being exposed to users.

## Required gates before enabling a capability

- Trace runtime configuration, secrets, storage, database, background jobs and external network calls.
- Identify user, organization, project and permission assumptions in the relevant module.
- Confirm licence and third-party asset obligations for that module.
- Define source-of-truth ownership and stable ID mapping.
- Add API schema and unit/integration tests, including cross-organization access-denial tests.
- Validate calculation parity, units, rounding and India-specific defaults against reviewed examples.
- Add feature flag and rollback path; deploy disabled by default.

## Licence and attribution

The imported source identifies itself as AGPL-3.0-or-later and includes a commercial-licence contact in its NOTICE. Preserve the original licence, notices, authorship and third-party attributions. Before distributing a combined derivative or making modified covered functionality available over a network, obtain legal review of AGPL source-availability, notice and corresponding-source obligations, or negotiate a suitable commercial licence. Do not represent the source as unrestricted proprietary code.

## Current exclusions

- No merge of ERP authentication into Business OS auth.
- No direct ERP database migration into Supabase.
- No overwrite of existing Next.js apps, packages, quotation engine, CRM, procurement or execution modules.
- No public exposure of the imported standalone frontend/backend.
- No production deployment or merge to `main`.
