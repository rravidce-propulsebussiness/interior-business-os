# Production checklist

Current decision: **NO-GO**. Every item below has an explicit status. BLOCKED means the actual hosted/operator evidence is absent. Local evidence does not certify the deployment. See PHASE11-BLOCKER-CLOSURE.md and the Phase 11B report.

Phase 11D's authoritative release gates, execution order and sign-offs are in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md); exact candidate identity is in [RELEASE-MANIFEST.md](RELEASE-MANIFEST.md). Follow [RELEASE-OWNERSHIP.md](RELEASE-OWNERSHIP.md) and [HOSTED-ENVIRONMENT-REQUIREMENTS.md](HOSTED-ENVIRONMENT-REQUIREMENTS.md). Preparation cannot close hosted gates; current verdict remains NO-GO.

## Before deployment

Verified local scope (these PASS results do not close the hosted gates below):

- **PASS** — Frozen install and the three development-tool advisory regression tests; full advisory remains visible and technically MITIGATED.
- **PASS** — 243 database-enabled tests across 35 files, plus ten separate email adapter tests; no real email acceptance claimed.
- **PASS** — Eight isolated recovery browser cases and seven recovery unit tests across the two admin apps.
- **PASS** — Fresh 103 migrations/1,079 SQL assertions, all 89 protected hashes, generated types and seed checks.
- **PASS** — Current local PostgreSQL archive restored with 1,078 regressions/types; seeded Phase 10 upgrade passes 1,078 regressions/types with data fingerprints preserved.
- **PASS** — Restricted local worker restart, interrupted-lease reclamation and duplicate checks; external provider remains unavailable.
- **PASS** — All three local production builds, lint/types and browser/source/artifact secret canary checks.
- **PASS** — Recovery/provider procedures specify preconditions, actions, expected outcomes, restoration, rollback and verification.

- **BLOCKED** — Operator, incident contacts, staging/production project IDs, hosting targets and domains recorded.
- **BLOCKED** — Separate environment credentials, public-key build inputs, Auth callback allowlists and private signing configuration verified.
- **BLOCKED** — Frozen install, formatting, lint, type checks, unit/database/browser tests, all builds and source/artifact scans pass for the release SHA.
- **BLOCKED** — All 89 preserved migration hashes match; clean staging migrations and drift checks pass.
- **BLOCKED** — Full dependency audit reviewed; remaining high tooling finding has an explicit release disposition.
- **BLOCKED** — Two-tenant hosted RLS/RBAC/entitlement/IDOR/revocation matrix passes.
- **BLOCKED** — Real Auth, recovery, storage and inbox email acceptance passes; local recovery UI implemented; hosted SMTP/template/token/session acceptance still required.
- **BLOCKED** — Worker/scheduler/retry/crash recovery/idempotency and provider-failure handling pass.
- **BLOCKED** — Public website/brochure/domain/TLS/cache and malicious input/file tests pass.
- **BLOCKED** — Database and Storage backups are private, restorable and independently verified; measured RTO/RPO approved.
- **BLOCKED** — Representative production load, connection, Storage/email/PDF capacity and monitoring/alert ownership verified.
- **BLOCKED** — Admin access/MFA policy, credential rotation and incident procedures reviewed and rehearsed.
- **BLOCKED** — No development/demo seed data or test variables/credentials in production.

## Deployment

- **BLOCKED** — Verified backup identifiers and migration compatibility recorded.
- **BLOCKED** — Approved migrations applied with the migration identity; no development bootstrap/seeds.
- **BLOCKED** — Schema/types/history/policies verified; investigate drift before repair.
- **BLOCKED** — Each environment-specific build scanned and immutable release deployed using validated startup.
- **BLOCKED** — TLS/host forwarding and network/provider access configured; private server artifacts/source maps retained privately.
- **BLOCKED** — Restricted worker launched under supervision with graceful drain/restart configuration.

## After deployment

- **BLOCKED** — Read-only HTTPS smoke script passes all three services, including dependency readiness.
- **BLOCKED** — Login/dashboard/CRM/quotation/billing/project/inventory/execution/website/brochure/notification/automation/report/PDF/logout smoke passes with real authorized identities.
- **BLOCKED** — Static assets, SSR/browser hydration, public 404/robots/sitemap/forms and private denial behavior verified.
- **BLOCKED** — Real scheduled work and inbox receipt verified without duplicated messages.
- **BLOCKED** — Logs/error rates/latencies/backlog/provider usage monitored and baseline recorded.
- **BLOCKED** — Staging application rollback to the prior artifact rehearsed against current schema.
- **BLOCKED** — All blockers closed and accountable release owner records GO with evidence.

## Failure and recovery

- **BLOCKED** — Stop rollout and pause affected worker/form/publication; preserve sanitized diagnostics.
- **BLOCKED** — Revert compatible application artifact or apply reviewed forward repair; never delete financial/stock/audit history to force success.
- **BLOCKED** — Restore into isolation when needed, verify tenant/data/asset integrity, and perform controlled cutover.
- **BLOCKED** — Record incident scope, actual recovery time/data loss and corrective action before reopening.

## Phase 11C acceptance tooling

Hosted execution remains **BLOCKED / NO-GO**. Use [ACCEPTANCE-RUNBOOK.md](ACCEPTANCE-RUNBOOK.md) and [ACCEPTANCE-ENVIRONMENT.md](ACCEPTANCE-ENVIRONMENT.md) for the guarded command, required real identities/provider configuration, explicit coverage results and sanitized evidence. [PRODUCTION-GO-NOGO.md](PRODUCTION-GO-NOGO.md) defines the release gates. No local or configuration-only PASS closes a hosted gate.
