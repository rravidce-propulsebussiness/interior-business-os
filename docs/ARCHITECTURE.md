# Architecture and decisions

Phase 11 preserves these package and domain boundaries while adding deployment validation, bounded requests, health/readiness, admin CSP and operational controls. See [production architecture](PRODUCTION-ARCHITECTURE.md) and [verification](PHASE11-VERIFICATION.md). Hosted readiness remains blocked.

Phase 10 adds one shared transactional outbox and restricted central worker around the existing canonical domain operations. Application routes manage structured rules, notification preferences, work queues and reports; they cannot fabricate trusted events or call worker entrypoints. PostgreSQL owns authorization, aggregate money calculations, scheduling/idempotency and immutable report data snapshots. The existing bounded offline PDF renderer serves protected report downloads. See [automation](AUTOMATION.md), [reporting](REPORTING.md) and [security](AUTOMATION-SECURITY.md).

## Phase 7 local implementation

Physical execution extends existing projects, accepted contracts, approved estimates and vendor/procurement records. New checked RPCs use the organization lock; receipt-lot inventory is an immutable ledger with a database negative-stock guard. Quantity and cost records remain separate. Approved planning and inspection/handover history is protected independently of application writes. New operations reads run under caller RLS; project assignment limits Site operational access. See PHASE7-VERIFICATION.md for the implementation and acceptance limits.

## Phase 5 commercial execution decisions

Contracts reference one customer-approved issued quotation revision, with a unique revision handoff and its exact accepted value. They never reprice accepted scope. Billing entitlement gates finance; contract and change-order operations also require Projects. Organization-scoped granular grants remain mandatory. Accountants receive billing capabilities through templates, not role-name runtime checks.

Checked database RPCs serialize financial writes on the existing organization lock. Decimal strings cross JSON boundaries; PostgreSQL numeric performs authoritative invoice, schedule and allocation arithmetic. Currency precision is frozen on the contract (default two decimal places); accepted values requiring greater precision are preserved by selecting sufficient precision up to six places, otherwise handoff fails explicitly. Number counters are scoped by organization, document kind and local calendar year. Idempotency keys bind payment submissions to their original payload.

Activated schedules are immutable additive allocations. Changes never rewrite historical milestones: positive variations can receive additional schedules; a deduction exposes schedule over-allocation until an entirely unbilled, unrequested schedule is superseded. Tax invoices and proformas are separate; only issued tax invoices count as invoiced and accept allocations. Generic component tax supports inclusive/exclusive line or document application with explicit rounding. This is configurable arithmetic, not statutory GST compliance. Issued invoices cannot be edited; void requires no active allocations and a reason. Credit/debit notes, refunds and online gateways remain deferred.

Payments, allocation reversals and receipt snapshots retain history. Receipts freeze allocations at recording time; later allocation is visible on the account statement without rewriting the original receipt. Contract closure requires zero invoice balance, zero unallocated credit and full contract billing. Approved change orders apply once; original-scope deletion uses the accepted line value after proportional revision discount, and modification stores that historical basis plus the canonical new-price snapshot. Catalog-backed change orders use the existing pricing engine and HMAC integrity mechanism with a distinct operation namespace. No second catalog pricing algorithm is introduced.

Customer delivery uses authorized snapshot-driven PDFs. Public change-order approval is deferred in this phase: authorized staff record explicit approval evidence, and no second bearer-token system is introduced. Existing Phase 4 quotation sharing remains unchanged. All financial data, including timeline records, is permission-filtered on the server.

Status: Phase 5 adds commercial execution while preserving the Phase 0–4 foundation.

## Phase 4 sales boundary

CRM feeds the existing Customer → Project → Quotation relationship. Conversion locks the organization and lead, checks permissions and tenant references, then creates or selects existing masters atomically. Concurrent retries return the original mapping. Activities remain on the originating lead; quotation triggers append commercial events automatically.

Business App public routes `/q/[token]`, `/q/[token]/pdf` and `/q/[token]/respond` use a publishable anonymous client and constrained RPC. A 256-bit random token resolves one exact issued revision through a private SHA-256 hash. The database builds an allowlisted customer projection. No service-role runtime credential or Website entitlement is needed. Responses are append-only records separate from frozen contents. Approval, issue and revocation serialize on the existing organization lock. See CRM.md, LEAD-CONVERSION.md, QUOTATION-SHARING.md and CUSTOMER-APPROVAL.md.

## Phase 2 decisions

The implementation follows the pre-implementation contracts in CATALOG.md and PRICING-ENGINE.md. The existing quotation-engine package owns Zod domain schemas, safe measurement methods, exact decimal arithmetic, dependency resolution and the one canonical calculation function. No domain code imports React, Supabase or an industry pack. industry-interior supplies versioned JSON starter definitions; a deterministic generator produces optional tenant seed SQL.

Database adds normalized tenant configuration and versioned effective rates. Internal costs are separate RLS-protected rows. The existing Supabase adapter exposes a catalog repository, not a second database abstraction. Existing auth services enforce granular permissions and entitlements; the new RPCs and policies reuse Phase 1 predicates. An invoker-rights STABLE snapshot RPC reads all configuration under caller RLS from one MVCC snapshot. UI server actions and the preview API authorize and call the same service/engine.

Configuration writes serialize on the organization row and check expected versions. Rates retain historical values; replacement closes the previous interval and inserts a successor atomically. Deactivation preserves rows. Existing audit infrastructure records allowlisted before/after configuration values and applies catalog/pricing/cost access to those audit rows too. No new packages, ORM, authentication mechanism or UI library were introduced.

## Phase 1 implementation decisions (before implementation)

Preserve all three applications and existing package boundaries. No ORM exists, so use the Supabase JavaScript client as the only runtime database adapter. PostgreSQL functions provide transactional provisioning and privileged mutations; no service-role key is required by application code. Platform functions authenticate the caller and resolve a separate platform permission graph. They never create implicit tenant membership.

Keep the existing pure canAccess policy. Add server-only session/context services that obtain verified Supabase Auth identity and current database grants, then invoke that policy. PostgreSQL independently enforces the same access rules. Cookie organization selection is only a preference. Resolve it on every request and deny stale or unauthorized selections. Next.js proxy refreshes cookies; it is not the authorization boundary.

Application roles receive scoped SELECT access under RLS and execute rights on explicitly reviewed RPCs, not unrestricted table mutations. SECURITY DEFINER functions use a fixed empty search_path, fully qualified names, revoked default execution, validation and current caller checks. Private helpers avoid recursive membership policies. Only migration owners bypass RLS; hosted browser/server requests use publishable credentials plus the user's JWT.

Organizations hold an optional plan. Current explicit entitlement windows override plan modules; an active explicit denial wins over active grants. Outside a window, the override does not apply. Module, plan, organization, profile and membership status are checked live. Website, brochure and client portal remain independent. Lists and module inspection routes use the same database-backed entitlement evaluation.

Default business roles are versioned database templates copied during transactional organization creation. Multi-role assignments retain organization or branch scope. An owner marker protects lifecycle invariants only, never substitutes for permissions. Serialize membership/role mutations on the organization row and reject removal/suspension of the final active owner. Role-management mutations may not grant authority the caller does not possess.

Use additive SQL migrations and generate TypeScript from the applied PostgreSQL catalog. An isolated local PostgreSQL test harness supplies only the Supabase auth schema/roles needed for SQL tests; it does not claim to test GoTrue, PostgREST or hosted Supabase. Live browser authentication tests are an explicit opt-in against a configured test project.

## ADR 001: modular monolith, separate delivery surfaces

Use pnpm source workspaces and three independently deployable Next.js App Router applications: platform-admin (control plane), business-app (authenticated tenant workspace), websites (public published content). Avoid microservices and a build orchestrator until measurable demand justifies them. Next compiles shared TypeScript sources; packages are private and not published.

UI calls server application services, which validate inputs and authorize operations before invoking tenant-scoped repositories. Domain packages must not import React, Next, Supabase or database adapters. Apps are composition roots. No app imports another app. Package public exports are the only supported import paths.

## ADR 002: isolation is a database and service responsibility

Supabase provides Auth, PostgreSQL and private Storage. Every business-owned record carries organization_id; branch records also carry branch_id. Identity does not imply membership. Derive tenant context from a verified session and active database membership, never trust a supplied organization ID alone. Repositories require explicit context and filter by organization. PostgreSQL RLS independently enforces membership and action scope, with both USING and WITH CHECK policies. Deny by default.

Service-role credentials bypass RLS and must never enter browser bundles or ordinary business request handling. Platform operations use separate server-only privileged adapters, explicit platform permissions and audit records. Platform roles do not automatically confer access to tenant data. Any future support access is time-limited, reasoned, separately authorized and audited.

## ADR 003: RBAC and entitlements are independent

Authorization requires active membership, a granular action permission, matching organization/branch scope and (for modular capabilities) a current entitlement. Plans grant entitlements through persisted configuration; services and UI never compare plan names. UI visibility is convenience, never enforcement. Website, brochure and client portal are distinct module keys. Module and industry-pack registries are database-driven; package names are implementation boundaries, not a commercial catalog.

## ADR 004: generic pricing, separate execution estimates

quotation-engine owns pure pricing contracts and eventually deterministic calculations. Catalog attributes, questions, options and modifiers are configurable data, not industry-specific columns. Industry packs provide versioned seed/configuration data through core contracts. Core cannot import industry-interior. Monetary arithmetic will use explicit currency, fixed precision/decimal arithmetic and documented rounding; no binary floating-point money calculations. No pricing algorithm is implemented in Phase 0.

## ADR 005: website publishing boundary

website-builder will own versioned page/section/component schemas, responsive overrides, design tokens, safe dynamic-content bindings and immutable publications. websites will read only published projections resolved through verified custom domains. Draft preview requires authorization. Sanitize rich content, allowlist components and bindings; no executable tenant JavaScript. Domain verification and uniqueness precede activation. Website publishing is independent of brochure and client portal.

## Package ownership

| Package           | Responsibility                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| shared            | Small cross-cutting validation, identifiers, safe errors and log contracts     |
| core              | Organization, membership, branch, entitlement and module contracts             |
| auth              | Pure access policy, verified session/context services and shared auth actions  |
| database          | SQL migrations, generated types, Supabase clients and server-only repositories |
| ui                | Accessible, responsive React primitives and semantic Tailwind tokens           |
| quotation-engine  | Industry-neutral pricing domain, no material cutting logic                     |
| website-builder   | Future document schema, validation and publishing domain                       |
| industry-interior | Interior configuration adapter; no core dependencies on this pack              |

## Operational boundaries

Validate external inputs with Zod at server boundaries. React Hook Form handles interactive form state when forms arrive. Return safe error codes and correlation IDs; keep diagnostics server-side. Emit structured, allowlisted logs without tokens, personal content or request bodies. Audit privileged actions and business mutations transactionally. Tenant keys must scope cache entries, object paths, background jobs, exports and search indexes. Revalidate membership and entitlements on each sensitive request; define revocation behavior before caching authorization.

Use server components by default, client islands for interaction. Shared UI follows shadcn/ui source ownership, semantic CSS variables and composable native props; add primitives only when needed. Each asynchronous route needs accessible loading, empty and error states. Protected dashboards render dynamically and do not cache tenant sessions. The public websites application remains the Phase 0 shell.

## Phase 3 quotation boundary

Customer/project schemas and the customer document renderer live in core. Commercial arithmetic extends quotation-engine using its existing Decimal and calculate functions. The database repository obtains an item-scoped authoritative configuration and signs the calculated result; SQL independently checks identity, RBAC, entitlements, optimistic version, replay nonce and configuration fingerprint in an organization-locked transaction. This avoids both duplicating pricing in SQL and exposing a browser-callable RPC that accepts forged totals. See QUOTATIONS.md and QUOTATION-SNAPSHOTS.md. PDF runs in Node with a customer-only DTO; it never serializes internal database rows.

## Phase 6 execution boundary

Execution has its own core schemas, server-only repository and Business App routes under /dashboard/execution. Server actions and SQL RPCs recheck organization, action grants and module entitlements. Named rule arithmetic uses exact PostgreSQL numeric values, while API quantities remain decimal strings. The existing quotation pricing engine and commercial snapshots are unchanged.

Quantity and cost tables are separate. Approved estimates and issued procurement documents retain frozen snapshots. PDF generation reuses the existing bounded Chromium renderer, with an escaped, allowlisted DTO, no remote resources and protected no-store routes. Organization locking serializes demand-changing writes; versions detect stale edits. See EXECUTION-ESTIMATION.md and PHASE6-VERIFICATION.md.

## Phase 8 Website module

See [Website architecture](WEBSITE-ARCHITECTURE.md), [builder](WEBSITE-BUILDER.md), [security and permissions](WEBSITE-SECURITY.md) and [verification](PHASE8-VERIFICATION.md). Website is optional, uses separate immutable public snapshots and canonical CRM enquiries, and does not introduce Phase 9.

## Phase 9 independent Brochure module

Business App authors strict millimetre-based brochure documents. The brochure-builder package owns schemas, editable templates, history operations and escaped fixed-page rendering. Shared Chromium infrastructure generates bounded print PDFs. Marketing kits reuse canonical organization identity and explicitly approved presentation data; shared private media preserves originals. Website entitlement and Website records are not prerequisites.

Atomic publication stores immutable document and PDF snapshots. The public Websites app reads only the current authorized publication at `/brochure/{business}/{slug}`. Restore creates a new edition; revocation is checked on each request. Canonical CRM handles all enquiries. See [Brochure architecture](BROCHURE-ARCHITECTURE.md), [security](BROCHURE-SECURITY.md) and [verification](PHASE9-VERIFICATION.md).
