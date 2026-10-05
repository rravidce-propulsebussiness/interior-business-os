# Operations runbook

No hosted deployment, backup or restore is certified. Assign an accountable operator, incident contact and deployment inventory before release. Never paste credentials into tickets or logs.

For provider-specific preconditions, outage detection, actions, restoration, rollback and verification, follow [provider recovery](PROVIDER-RECOVERY.md). The current execution status and remaining infrastructure dependencies are recorded in PHASE11-BLOCKER-CLOSURE.md. Password recovery configuration and hosted inbox acceptance are in AUTH-RECOVERY.md.

## Deploy and migrate

1. Identify the exact environment, Supabase project ID, domain, release SHA and migration history. Verify separate staging/production credentials and empty/fresh staging target for initial acceptance.
2. Run frozen install, formatting, lint, types, unit/database tests, production builds and both secret scans. Archive results with release SHA. Review the full dependency audit, including development tooling findings.
3. Verify a recent restorable database backup including the current private bytea assets. A separate object backup is required only if an external Storage adapter is actually configured. Record identifiers, retention, access controls and encryption; avoid copying secrets into the release record.
4. Rehearse migrations on staging. Compare hosted migration history, schema and generated types. Investigate every difference before making changes; never patch dashboard SQL silently. Production migration is a separate operator-controlled step, not automatic application startup.
5. Apply approved additive migrations with a dedicated migration identity, verify schema/RLS/indexes/functions/triggers and retain output privately. Do not run development seeds or the local PostgreSQL bootstrap on Supabase.
6. Validate each service with `node scripts/start-service.mjs <service> --check`, build for that environment and deploy the immutable release. Configure the worker as one supervised continuous service with automatic restart and a graceful-stop allowance exceeding its 55-second query bound plus in-flight provider acknowledgement.
7. Run `pnpm production:smoke` with the three HTTPS origin variables. This checks only root/health/readiness and headers. Complete authenticated and business/public flow acceptance separately. Record actual results and provider/inbox evidence.

If the migration or smoke check fails, stop rollout, preserve diagnostics privately and follow rollback. Do not weaken policies or bypass readiness to declare success.

## Health and monitoring

`/api/health` reports process liveness without credentials. `/api/ready` probes a data-free invoker RPC through PostgREST with a public key, a four-second timeout and five-second coalesced result cache. It returns generic 503 when unavailable. It does not certify Auth, Storage, email, worker activity or business correctness. Health endpoints are intentionally public and disclose no tenant data.

Aggregate structured logs by environment/service/event/requestId. Collect HTTP error rate, p50/p95/p99 latency, memory/CPU, database connections/slow queries, PDF failures, worker heartbeat/backlog/dead letters and email rejection/retry counts. Existing platform automation monitoring requires platform authorization. Worker tick logs contain counts/timing, never recipients or connection strings. Configure alert ownership, deduplication and recovery notifications in the chosen monitoring system; no alert integration currently exists.

On readiness failures, inspect provider status, connection/TLS configuration and migration presence. On worker failures, check restricted login membership, worker status, queue leases and sanitized logs. Restart under supervision, retain stable idempotency keys and let existing lease recovery run; do not manually mark unknown emails sent. On email failures, check verified sender, provider status, quota and delivery history; only retry through the authorized workflow. On PDF pressure, limit intake or scale after resource measurements, rather than removing bounds.

## Rollback

Drain the worker, retain current database schema and redeploy the previous immutable application artifact only if it was rehearsed against the new schema. Recheck all three readiness endpoints and smoke/auth flows. The readiness migration is additive and grants only execution of a data-free function. Do not invent destructive down migrations for financial or inventory history. For incompatible changes, use a reviewed forward repair; for corruption use isolated restore and controlled cutover. Record actual staging application rollback duration and results before approving production.

## Backup, restore and disaster recovery

Use provider-supported database backups/PITR for the actual plan and verify current private bytea asset coverage. Separately export object bytes and bucket/policy metadata only if an external Storage adapter is actually configured. Store backups under a separate access-controlled operator identity, encrypt them and test retrieval. Record retention and last successful backup time. Verify Auth configuration, SMTP settings, signing-key IDs and deployment configuration can be restored from the secret store without committing them.

Restore into a new isolated staging project/database, never over the live production target as a rehearsal. Suspend outbound email, cron/worker processing, public domains and external integrations before restoration to prevent duplicated messages or actions. Restore the supported database dump/PITR and current private bytea assets (and external objects only when actually configured); account for provider-managed Auth/Storage schemas using the provider's supported procedure. Compare migration history and expected schema/types; test two-tenant RLS, revoked permissions, Auth, private object access, immutable financial snapshots, ledger balances, published assets and authorized PDFs. Resume one worker and test outstanding leases/idempotency safely. Archive evidence, checksums and elapsed times without private record contents.

**RPO and RTO are unmeasured and unapproved.** Record restore-start time, usable-service time and newest recovered committed record/asset in an actual rehearsal; agree targets against those measurements and backup frequency. A successful local schema rebuild is not backup restoration or hosted disaster recovery.

## Data and capacity

Import real business data only through an approved, validated tenant-scoped process after backup and staging rehearsal. Reconcile money, stock, references and audit history before cutover; exclude all demo identities/seed records. Use existing permission-filtered report exports, not unrestricted platform dumps. Preserve immutable financial, inventory, audit and publication history when archiving; review deletion/retention requirements before destructive cleanup.

Maintain usage baselines and budgets for database rows/connections, Storage bytes, email volume and PDF throughput. Review cleanup of private orphan assets and expired artifacts with ownership checks and backup protection. Avoid adding indexes without query plans from representative tenant data. Known local Phase 10 timings are historical fixtures, not production capacity guarantees.

## Phase 11C acceptance tooling

Hosted execution remains **BLOCKED / NO-GO**. Use [ACCEPTANCE-RUNBOOK.md](ACCEPTANCE-RUNBOOK.md) and [ACCEPTANCE-ENVIRONMENT.md](ACCEPTANCE-ENVIRONMENT.md) for the guarded command, required real identities/provider configuration, explicit coverage results and sanitized evidence. [PRODUCTION-GO-NOGO.md](PRODUCTION-GO-NOGO.md) defines the release gates. No local or configuration-only PASS closes a hosted gate.
