# OpenConstructionERP Integration Assessment

Status: source import complete; capability and tenancy review recorded. No ERP runtime is exposed to Business OS users yet.

## Verified source import

- Upstream: `datadrivenconstruction/OpenConstructionERP`
- Pinned upstream commit: `2d27b866937ea3bd66d3878707b357a3099ba7fa`
- Imported destination: `vendor/openconstructionerp/`
- Imported files: 15,554
- Destination branch: `integration/full-erp-merge`
- Import commit: `f4c5cd083d849de0a2ee56400cc6f61c8b711945`
- Import workflow: successful (run #3)
- Root and backend copies of `LICENSE` and `NOTICE` are retained.

This is a preserved source import, not a production integration.

## Runtime and database findings

Business OS is a pnpm TypeScript monorepo with Next.js applications, shared packages and Supabase/PostgreSQL.

OpenConstructionERP has a separate Python 3.12+ backend and React/Vite frontend. Its backend `app/database.py` explicitly enforces PostgreSQL and describes embedded PostgreSQL as the default, with external PostgreSQL supported through `DATABASE_URL`. The backend README also documents the embedded PostgreSQL setup. The checked-in `alembic.ini` has a SQLite URL, but this is not sufficient evidence that SQLite is supported by the live backend; treat it as a stale/default migration configuration until the Alembic environment and runtime URL override are traced. Do not use SQLite as the integration target.

The backend `main.py` mounts many module routers under its API and establishes request-time RLS context. Its startup path can run PostgreSQL schema-healing/migration logic. It must not be pointed at the existing Business OS Supabase database.

## Critical tenant and identity incompatibility

The source file `backend/app/core/tenant_scope.py` explicitly documents that the current ERP has no separate Tenant/Organization entity. Its current tenant fallback is the JWT subject/user ID. `backend/app/dependencies.py` resolves that tenant from the caller token. Its BOQ access checks use project ownership and project membership; assemblies scope through owner IDs; drawing takeoff checks project access.

Business OS uses organization membership and organization-scoped authorization. Therefore:

- Never pass a Business OS organization ID as if it were an ERP user ID.
- Never use a shared ERP administrator, demo account or global owner to represent all Business OS organizations.
- Never trust browser-supplied ERP user IDs, tenant IDs, project IDs or role claims.
- Do not expose any ERP endpoint until the identity mapping and per-organization authorization model has been implemented and tested.
- A service credential alone is not a tenant boundary. Every request must be bound to a verified Business OS organization and a narrowly scoped ERP principal or an equivalent server-enforced organization partition.

Required design decision: implement an explicit organization-to-ERP-principal mapping and enforce organization isolation in the ERP service/data layer, or refactor the ERP tenant model to support organization IDs directly. A mapping-only approach is acceptable only if all project, BOQ, assembly, drawing, file, search, background-job, audit and storage access paths are proven to honor the same organization boundary. A single user-owned ERP tenant cannot safely represent multiple Business OS organizations.

## Capability inventory: first estimating wave

### BOQ
Source area: `backend/app/modules/boq/`
- Router and service/repository/model/schema layers exist.
- Supports BOQ/project access checks, sections and positions, quantity links, branches, revisions/export/import and resource norms.
- Quantities are accepted as numeric values; monetary values use Decimal and are serialized as decimal strings in key schemas.
- Position unit validation normalizes units.
- BOQ endpoints depend on ERP project ownership/membership checks. They are not organization-aware by default.

### Parametric assemblies
Source area: `backend/app/modules/assemblies/`
- Formula engine, parametric assemblies, components and templates.
- Assembly scope uses owner IDs and project access.
- Decimal-safe monetary handling is present in important rollups.
- Must not be treated as organization-isolated until the tenant boundary is corrected.

### Drawing takeoff
Source area: `backend/app/modules/dwg_takeoff/`
- Drawing upload, drawing metadata, annotations, entity groups, scale and quantity links.
- Project access checks exist around read/write paths.
- Upload and download paths depend on server storage roots and file handling; these require separate storage isolation, malware/file validation, size limits and signed-access review before enabling.
- Takeoff output should be reviewed before it updates a BOQ; measurements must not silently overwrite approved quantities.

### Cost matching and estimate rollup
Source areas: `backend/app/modules/cost_match/` and `backend/app/modules/estimate_rollup/`
- Separate matching and estimate composition/rollup capabilities exist.
- Their currency, market/rate provenance, unit conversion and permissions need a focused review before exposing to India projects.

## Recommended product boundary

1. Business OS remains the product shell and canonical identity/organization system.
2. Business OS remains authoritative for customers, projects, quotations, contracts, billing, vendors, inventory and membership wherever those domains already exist.
3. ERP specialist estimating services run separately with their own isolated PostgreSQL database initially.
4. A server-only Business OS adapter authenticates the user, resolves active organization membership and permission, maps the Business OS project to an ERP project, and forwards only server-verified context.
5. ERP response data is validated by a typed contract before being returned to the UI.
6. BOQ/takeoff quantities may feed the existing Business OS quotation engine as reviewed inputs. Do not create a second customer-facing quotation total engine.
7. Rebuild estimating screens in the Business OS Next.js design system; do not expose the imported standalone Vite app as the new product UI.

## Typed contract package (created; not yet runtime-connected)

A new workspace package `@business-os/erp-contracts` now defines strict Zod boundary schemas for organization-bound server context, BOQ creation, BOQ positions, BOQ responses and staged takeoff imports. It requires decimal strings for quantities/rates, uses INR as the default BOQ currency, and includes idempotency and BOQ-version preconditions for takeoff imports. Contract tests cover context expiry, defaults, decimal-string enforcement and takeoff preconditions. These schemas validate payload shape only; they do not authenticate requests or establish tenant isolation. Runtime adapters remain disabled until the ERP organization boundary is implemented and verified.

## First API contract (proposed, not implemented)

- `POST /internal/v1/organizations/{organizationId}/projects/{projectId}/boqs`: create a draft BOQ only after server-side org membership, project mapping and permission checks.
- `GET /internal/v1/organizations/{organizationId}/projects/{projectId}/boqs`: list BOQs within the mapped organization/project.
- `GET /internal/v1/organizations/{organizationId}/boqs/{boqId}`: fetch BOQ with explicit org/project ownership check.
- `POST /internal/v1/organizations/{organizationId}/boqs/{boqId}/positions`: add a validated position; use decimal strings for rates/money and normalized units.
- `POST /internal/v1/organizations/{organizationId}/boqs/{boqId}/takeoff-imports`: stage takeoff quantities for review; never silently apply to approved/issued BOQ positions.
- `POST /internal/v1/organizations/{organizationId}/boqs/{boqId}/takeoff-imports/{importId}/apply`: explicit authorized apply action with idempotency key, before/after audit record and version check.

The organization ID in these paths is a routing scope, not authorization. The gateway and ERP service must independently verify the signed server context and resource ownership. Do not expose these proposed paths until implemented.

## Required security and correctness gates

- Organization isolation tests: organization A cannot read, mutate, enumerate, search, export or download organization B data.
- Cross-project access tests for BOQs, assemblies, drawings, annotations, files and background jobs.
- Explicit ERP principal mapping; no shared admin identity.
- Signed service-to-service authentication, audience/issuer checks, short expiry and replay protection.
- Idempotency and audit history for create/update/import/apply operations.
- File storage path isolation, content-type validation, upload limits, malware scanning and signed download URLs.
- Decimal string handling, unit conversion, quantity bounds, rounding rules and India-specific rate provenance.
- BOQ version checks and approval workflow before quantities affect customer quotations.
- Separate database and migration rehearsal; no ERP schema healing against Business OS Supabase.
- Feature flag, observability, rate limits and rollback plan.

## Licence and attribution

OpenConstructionERP declares AGPL-3.0-or-later. Preserve the original licence, notices, authorship and third-party attributions. Before distributing a combined derivative or making modified covered functionality available over a network, obtain legal review of AGPL source-availability, notice and corresponding-source obligations, or negotiate a suitable commercial licence. Open source does not mean unrestricted proprietary reuse.

## Current exclusions

- No ERP auth merged into Business OS auth.
- No direct ERP migration into Business OS Supabase.
- No public exposure of the imported standalone frontend/backend.
- No shared admin or demo identity used for organization tenancy.
- No ERP quantity silently overwrites approved Business OS estimates or quotations.
- No production deployment or merge to `main`.
