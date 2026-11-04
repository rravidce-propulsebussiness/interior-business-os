# Full OpenConstructionERP Integration Plan

Status: preparation branch created; source import has not yet been performed.

## Destination and source

- Destination repository: `rravidce-propulsebussiness/interior-business-os`
- Destination baseline: `main` at `411cba931a6ab1f93fbaa3195520dda21ac0408b`
- Working branch: `integration/full-erp-merge`
- Safety branch: `backup/pre-erp-integration-2026-11-04`
- Source repository: `datadrivenconstruction/OpenConstructionERP`
- Source branch inspected: `main`
- Source snapshot inspected: `2d27b866937ea3bd66d3878707b357a3099ba7fa`

## Confirmed architecture differences

Business OS is a pnpm/TypeScript monorepo using Next.js applications, shared TypeScript packages, Supabase/PostgreSQL and Node.js 24.

OpenConstructionERP is a multi-part application with a Python/FastAPI backend, a React/Vite frontend, PostgreSQL/Alembic migrations, Python packages, data/catalogue assets, deployment files and other supporting projects.

These are not directly interchangeable workspaces. The full source must first be imported intact, then made runnable alongside Business OS before we consolidate identity, tenant boundaries, data and user experience.

## Integration rules

1. Do not overwrite the existing Business OS applications, packages, migrations, CI workflows, environment files or deployment scripts.
2. Import the complete OpenConstructionERP source as a preserved source subtree under `vendor/openconstructionerp` (including its LICENSE, NOTICE, AUTHORS and attribution files).
3. Keep its Python backend and frontend build independently runnable during the first integration stage.
4. Do not apply the ERP Alembic migrations to the existing Business OS/Supabase database. First inventory schema collisions, tenant keys, authorization assumptions and data ownership; then design reviewed additive migrations.
5. Do not merge authentication by trusting ERP user IDs. Map ERP identities to verified Business OS identities and organization memberships through an explicit migration/service boundary.
6. Keep the source import and all modifications on this branch. Do not force-push or change `main`.
7. Redesign the combined product after both systems can be built and tested independently.
8. Keep AGPL-3.0 notices and provide corresponding source and modification notices as required. Obtain legal review before commercial network deployment or distribution.

## Phases and exit gates

### Phase A — source import
- Fetch the exact source commit recorded above.
- Import the full repository tree into `vendor/openconstructionerp`, preserving file modes, symlinks where supported, source notices and history where practical.
- Verify the imported tree against the source commit (path count, file hashes, licence and notice files).
- Ensure root Business OS scripts and workflows remain unchanged.

### Phase B — independent boot and baseline
- Record supported Python version, package manager, services, environment variables and external dependencies.
- Build and test ERP backend and frontend independently.
- Run Business OS format/lint/typecheck/tests/build independently.
- Record all pre-existing failures; do not mislabel them as integration regressions.

### Phase C — architecture and data integration
- Produce a module inventory and overlap matrix against Business OS.
- Map tenants, users, organizations, projects, customers, vendors, catalogues, BOQ, estimates, procurement, finance, schedule and documents.
- Define one authoritative identity/organization model and a controlled cross-system API.
- Review every ERP migration for naming collisions, RLS, tenant isolation, foreign keys, numeric precision, audit history and rollback.
- Migrate only after isolated database tests and backups.

### Phase D — unified product
- Rebuild navigation, design system and responsive UI for one product.
- Integrate module-by-module, retaining proven domain logic and replacing duplicated workflows deliberately.
- Add feature flags and role/entitlement checks.
- Verify existing Business OS workflows and ERP workflows end-to-end.

### Phase E — release
- Security review, dependency/license scan, tenant-isolation tests, backup/restore test, performance test and deployment rehearsal.
- Open a pull request into `main`; do not merge until all required gates pass.

## Current execution status

- [x] Inspected both repository trees and their baseline architectures.
- [x] Created `backup/pre-erp-integration-2026-11-04` from the destination baseline.
- [x] Created `integration/full-erp-merge` from the same destination baseline.
- [ ] Imported the ERP source tree.
- [ ] Built and tested both applications.
- [ ] Designed and tested the unified database/auth integration.
- [ ] Unified UI and workflows.
- [ ] Opened and approved a pull request.

## Why the source import is a separate operation

The ERP contains a very large source tree. A normal Git clone/subtree operation is the reliable way to transfer all blobs and preserve file modes and history. A GitHub contents-API loop is not an appropriate bulk-import mechanism for this repository. Perform the import from a local clone or a CI runner, then push the resulting commit to `integration/full-erp-merge`.
