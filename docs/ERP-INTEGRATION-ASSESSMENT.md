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


## Additional takeoff isolation findings (reviewed 2026-11-04)

The takeoff repository confirms that project checks alone are not a sufficient organization boundary:

- `TakeoffRepository.get_by_id(doc_id)` loads a document by primary key without an owner or project predicate. Callers must prove access before invoking it; the repository does not independently enforce that proof.
- `TakeoffRepository.list_for_user(owner_id, project_id=...)` scopes document lists to an ERP owner ID, optionally narrowed by ERP project ID.
- `get_by_source_document_id(source_document_id, project_id=...)` scopes the idempotency lookup to an ERP project, not a Business OS organization.
- `update_fields(doc_id, ...)` and `delete(doc_id)` operate by document ID. They rely on the service/router layer to authorize the row first.
- Measurement reads are project-scoped in methods such as `list_for_project`, `count_for_document` and `list_all_for_document`; their safety therefore depends on the project ID being independently authorized and correctly mapped.
- `TakeoffDocument` stores `owner_id`, `project_id` and a server filesystem `file_path`. It has no organization key. A document path is not a tenant isolation mechanism.
- CAD extraction sessions store `user_id`, `project_id` and `created_by` as user/project-oriented fields. Session ownership and any persisted extraction payload must be included in the same isolation review.

### Required remediation before takeoff can be enabled

1. Add a durable organization scope to every tenant-owned ERP resource (documents, measurements, CAD sessions, BOQs, assemblies, exports and background jobs), with non-null constraints for newly created tenant-owned rows.
2. Ensure every repository read, update and delete either includes the organization predicate or accepts a previously authorized resource object through a narrowly scoped transaction boundary. Primary-key-only helpers must not be callable from untrusted request paths without an authorization guard.
3. Bind document and CAD file storage to an organization/project-specific opaque storage key. Resolve paths server-side; never accept a filesystem path from the client. Authorize downloads independently of upload/list permissions.
4. Add database constraints/indexes that prevent cross-organization relationships (for example, a measurement cannot reference a document in another organization even if both UUIDs are valid).
5. Test direct-ID access, list/filter/count/export, source-document idempotency, update/delete, file download, CAD session retrieval, background processing and concurrent operations with two organizations. Include a privileged ERP administrator test to prove no application route accidentally inherits a global bypass.
6. Until those changes land, the safe integration surface remains typed contracts and documentation only; no takeoff proxy or UI feature flag should be enabled.

These findings are a code-level review of the takeoff models/repository, not a claim that every route is exploitable. Router/service authorization still needs endpoint-by-endpoint tracing and adversarial tests before any exposure.


## Additional takeoff route and authorization review (2026-11-04)

The endpoint review reinforces that upstream authentication/RBAC is user/role based, not organization based:

- `RequirePermission` requires a valid ERP access token and checks the token's permission list/live role registry. The `admin` role bypasses every module permission. This establishes authentication and feature permission, but not Business OS organization membership.
- `verify_project_access` checks ERP project existence, ERP admin status, owner ID and ERP team membership. An ERP admin can reach any ERP project. That bypass cannot be used as a substitute for an organization boundary.
- The `/cad-extract/` endpoint requires `takeoff.read` but has no project parameter or persistent project association. It performs conversion and returns grouped results directly. It must remain disabled in any multi-organization proxy until an explicit organization/project context and resource policy are added.
- The interactive `/cad-columns/` flow creates a CAD session and records the ERP user ID; follow-up grouping endpoints call `_verify_cad_session_access`. Project-bound sessions reuse ERP project access; standalone sessions require exact uploader identity. This is a useful user-level IDOR defense, but it does not support shared organization membership or organization transfer.
- `_get_session_from_db` retrieves a CAD session by session ID and expiry first; the route-level ownership helper is what gates subsequent use. The in-memory fast path has the same requirement. Every consumer must preserve that guard.
- Converter install/uninstall and converter progress operate on shared server-level binaries/progress keyed by converter ID, not tenant-owned business data. These are host-administration capabilities, not organization features; they should not be exposed to ordinary Business OS members. In particular, a shared progress feed should not be treated as per-user status or authorization.
- `/cad-extract/` and `/cad-columns/` have permission dependencies, so they are not anonymous endpoints; however, permission alone is not the same as a verified project/organization grant.

### Integration disposition from this review

No takeoff routes are approved for proxying yet. First candidates after remediation should be limited to explicitly project-bound BOQ/document/measurement operations. Keep converter management, host diagnostics, unscoped CAD conversion, and global install progress outside the Business OS tenant-facing API.

Required automated test matrix must include:
- ordinary member versus organization admin versus ERP global admin;
- two Business OS organizations mapped to distinct ERP project partitions;
- direct-ID reads and mutations with guessed IDs;
- standalone CAD session owner versus another member of the same organization;
- project-bound session access by an authorized teammate in the same organization;
- attempts to use another organization's project ID even when the caller has the same ERP role;
- unscoped conversion endpoints and host-level converter controls blocked from the tenant-facing gateway.

The upstream checks provide a useful starting point for user-level access control, but they do not establish organization-level isolation. This distinction is now explicit in the integration gate.
