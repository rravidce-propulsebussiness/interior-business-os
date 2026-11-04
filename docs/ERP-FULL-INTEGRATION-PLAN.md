# Full OpenConstructionERP Integration Plan

Status: full upstream source imported to the isolated integration branch; architecture assessment recorded. Capability integration has not yet been enabled.

## Destination and source

- Destination repository: `rravidce-propulsebussiness/interior-business-os`
- Destination baseline: `main` at `411cba931a6ab1f93fbaa3195520dda21ac0408b`
- Working branch: `integration/full-erp-merge`
- Safety branch: `backup/pre-erp-integration-2026-11-04`
- Source repository: `datadrivenconstruction/OpenConstructionERP`
- Source branch inspected: `main`
- Source snapshot imported: `2d27b866937ea3bd66d3878707b357a3099ba7fa`
- Imported path: `vendor/openconstructionerp/`
- Imported file count: 15,554
- Import commit: `f4c5cd083d849de0a2ee56400cc6f61c8b711945`
- Import workflow: successful (run #3)

## Confirmed architecture differences

Business OS is a pnpm/TypeScript monorepo using Next.js applications, shared TypeScript packages, Supabase/PostgreSQL and Node.js 24.

OpenConstructionERP is a multi-part application with a Python 3.12+ backend project, React/Vite frontend, Alembic migration configuration, data/catalogue assets and supporting tools. Its standalone runtime and database assumptions must be audited before integration.

These are not directly interchangeable workspaces. The full source is preserved intact under `vendor/openconstructionerp`; it must be made safely runnable alongside Business OS before identity, tenant boundaries, data ownership and user experience are consolidated.

## Import safety and integration rules

1. Do not overwrite existing Business OS applications, packages, migrations, CI workflows, environment files or deployment scripts.
2. Preserve the imported upstream source, including LICENSE, NOTICE, AUTHORS and attribution files.
3. Keep the Python backend and React/Vite frontend isolated during the first integration stage.
4. Do not apply ERP Alembic migrations to the existing Business OS/Supabase database. Inventory schema collisions, tenant keys, authorization assumptions and data ownership first.
5. Do not merge authentication by trusting ERP user IDs. Map verified Business OS identities and organization memberships through an explicit service boundary.
6. Keep all source imports and modifications on `integration/full-erp-merge`; do not force-push or change `main`.
7. Redesign the combined product in the existing Next.js UI after capability contracts and security boundaries are established.
8. Reuse the existing canonical Business OS quotation engine for customer-facing quotation totals; evaluate ERP takeoff/BOQ calculations as validated inputs with parity tests.

## Next implementation sequence

1. Complete the runtime, database, module, identity and permission inventory. See `docs/ERP-INTEGRATION-ASSESSMENT.md`.
2. Select the first low-risk estimating capability and define a typed API contract.
3. Build a server-only integration adapter with organization-scoped authorization, audit logging, idempotency and cross-tenant tests.
4. Run the ERP service isolated from the Business OS production database and authentication.
5. Rebuild the first workflow in the Business OS Next.js design system behind a feature flag.
6. Expand capability by capability only after calculation, security, build and acceptance tests pass.

## CI baseline

The existing Foundation checks workflow has known formatting failures on the pre-integration baseline (Prettier reports 443 files). Treat that separately from the source-import workflow; do not claim the full repository CI is green until baseline issues are addressed and the integration branch is tested.

## Licence

OpenConstructionERP declares AGPL-3.0-or-later. Preserve all licence, notice and third-party attribution material. Before distributing a combined derivative or making modified covered functionality available over a network, obtain legal review of the AGPL obligations or negotiate a suitable commercial licence. Open source does not mean unrestricted proprietary reuse.
