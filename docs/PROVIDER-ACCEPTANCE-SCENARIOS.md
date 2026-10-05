# Provider acceptance scenarios

Candidate: `rc/2026-10-05-phase11d.3`. **All real provider outcomes remain BLOCKED.** Current architecture: Supabase Auth/PostgreSQL/PostgREST, Resend business transport, separate Auth SMTP, private database bytea media and one continuous worker/scheduler. Hosting, DNS/TLS and monitoring providers are not selected. No actual control operation, capability, recovery measurement or PASS is invented.

## Binding and evidence contract

For each service, its assigned owner first records the actual provider/plan, dependency/region, project/account/resource, scoped configuration and secret-manager references, exact supported control operation or UI location, failure mode and affected disposable resource, expected result, recovery operation, operator and timing. This register is private. Independently verify staging ownership and production denylist before any change. Unavailable binding/control/required capability means BLOCKED.

Each test record identifies RC/full SHA, migration state, environment/project fingerprint, tester/release owner, service/test ID, UTC date, PASS/FAIL/BLOCKED/NOT APPLICABLE and sanitized evidence references. Keep provider IDs/checksums/counts/timings, not credentials, private records, dumps, mail bodies or capability URLs. The sequences below become executable once the actual controls are bound; an invented generic endpoint is not a provider adapter. Critical recovery/capacity/TLS cannot be waived as NOT APPLICABLE because the selected plan lacks support.

## PA-SB — Supabase

Owner: SB/DB, SEC verifies security; current status **BLOCKED**. Dependency/configuration: isolated actual project, migration identity, verified TLS read-only acceptance connection, public application credentials with caller identity, independent remote marker, managed Auth redirects/templates/SMTP and actual plan limits.

1. **Migration/connection:** apply approved 103-file chain via selected supported provider workflow, without development bootstrap/seeds. Compare actual history/catalog/functions/RLS/types to pinned RC and 89 protected hashes, probe real PostgREST/readiness/TLS and restricted identity. Expected no drift. Preserve operation/history digest and assertions; stop drift, never rewrite baseline.
2. **Auth/RLS/limits:** execute CBS-015–018 with confirmed controlled accounts, real A/B positive fixtures, API denials and real mail; observe permission/entitlement revocation. Inventory actual connection/Auth/request/storage limits before approved load. Expected tenant isolation, correct caller authorization and bounded quota behavior; actual project/provider evidence required.
3. **Failure/recovery:** pause outbound work and use approved disposable service/network control. Observe bounded API/readiness failure and real monitoring; restore saved valid provider/configuration and recheck Auth/RLS/canonical records. Never weaken TLS or publicize tables for recovery. Record actual control/recovery ID and elapsed time.
4. **Storage:** private bytea media follows database recovery and PA-STORAGE. Managed external Storage buckets are NOT APPLICABLE to this candidate; do not add a bucket.
5. **Backup/restore/PITR:** follow PA-BACKUP using actual supported plan controls and a different isolated destination. Backup-list success alone cannot close restore.

## PA-MAIL — Auth SMTP, Resend and controlled inbox

Owner: MAIL/AO/QA; every applicable outcome **BLOCKED**. Configuration/dependencies: real verified sender/domain, scoped Auth SMTP and business credentials, controlled inbox access, actual quotas/cooldowns, worker recipient authorization/consent and pinned provider origins. Existing Mailosaur retrieval is optional; another real inbox needs its actual reviewed procedure, not fake SMTP.

| Test/failure                 | Actual test and expected outcome                                                                                                                | Recovery/evidence                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sender verification/delivery | Inspect real provider verification; request Auth recovery and authorized business email; retrieve correctly addressed messages after test start | Provider/message/inbox IDs and UTC receipt; API acceptance alone insufficient                    |
| Bounce/invalid recipient     | Use provider-approved controlled bounce address/domain; canonical business commit remains and failure disposition is visible                    | Actual bounce/delivery history, corrected approved recipient and existing retry policy           |
| Provider rejection           | Apply real safe staging reject control and CBS-022; bounded visible failure without rolling back source business action                         | Restore integration, authorized retry, real attempt/error and inbox evidence                     |
| Timeout/provider outage      | Interrupt staging integration using reviewed actual control; uncertain acknowledgement stays uncertain                                          | Restore route, reconcile provider/idempotency IDs before retry, no duplicate receipt             |
| Rate limit                   | Approved provider-safe quota scenario; inspect actual 429/cooldown and retry state                                                              | Wait real cooldown/restore control, preserve attempt timing; no production bulk load             |
| Credential rotation          | Rotate staging secret through secret manager, update affected worker/Auth SMTP config, verify old key denied privately                          | Revoke old key, actual delivery with new key; rollback only to still-authorized secret reference |
| Recovery                     | Actual UI reset, new/old password results, invalid/reused/naturally expired link and eventual business delivery                                 | Update controlled password secret store, revoke sessions, reconcile no duplicate effects         |

Expected: source/recipient permission and consent rechecked, no mail-token/body logs, actual business transaction survives provider failure. No invitation-email behavior is invented where only membership invitation exists.

## PA-DEPLOY — Selected deployment provider

Owner: INF/AO/RO; status **BLOCKED**. Configuration/dependencies: actual provider/project/runtime/image, three HTTPS origins, Node/native Sharp/Chromium/psql/CA requirements, scoped secret store, supervisor and retained prior/current immutable artifacts with actual SHA/digests. Public Supabase build inputs must be environment-correct.

1. Frozen clean build, checked launcher validation and actual deploy; verify real source/artifact identity, health/readiness/headers and authenticated/public canonical smoke. No hosted image digest is invented from local `.next` hash.
2. Restart identified staging app/worker using real supervisor controls; verify readiness recovery, drain/lease behavior and idempotency. Preserve deployment/process/job IDs.
3. Introduce safe bad staging artifact/configuration, observe actual health/monitoring failure, restore saved compatible artifact/configuration and retest canonical/security flows. Failed evidence remains.
4. Execute CBS-021 deploy A, verify, deploy B, verify, drain, roll back A, verify current-schema compatibility and worker recovery. Record actual operation/duration. Incompatibility requires reviewed forward repair or isolated restore, never fabricated destructive down migration.
5. Scaling only where supported and approved: actual replicas/resource/connection/PDF-concurrency allowance and measured correct behavior. Unsupported scaling is a design limitation; capacity hard gate still needs real evidence.

## PA-DNS — DNS/TLS

Owner: DNS/INF/SEC; status **BLOCKED**. Configuration/dependencies: owned disposable domain/zone, saved records/version/TTL, selected host binding and real certificate issuance/renewal controls.

Create approved staging DNS via actual provider control; observe authoritative/recursive resolution and propagation timestamps to intended environment. Verify real hostname/chain/validity/expiry and HTTPS canonical/robots/sitemap/private boundaries. Observe renewal using actual provider history/test capability; unavailable evidence remains BLOCKED, no clock manipulation or unsupported renewal claim. Change/remove only disposable record/domain mapping, observe failure/removal without draft/private exposure; restore saved zone/hosting/certificate, wait actual propagation and retest. Evidence: sanitized zone/certificate/control IDs and observed DNS/TLS/HTTP results. HTTPS text in configuration is insufficient.

## PA-STORAGE — Database media adapter

Owner: AO/DB/SEC; hosted current-adapter status **BLOCKED**; external object-store drill **NOT APPLICABLE**. Configuration/dependency: actual private website/brochure bytea, owned synthetic asset/checksum, snapshot references, storage limits and safe isolated database/media failure control.

Execute CBS-023: approved upload failure, verify no dangling committed reference; approved download unavailability, generic bounded failure; restore connectivity and actual owned/public bytes/checksum. Test own/foreign/anonymous upload/download/replace/delete and capability revocation; referenced immutable media cannot be purged. Expected canonical business/media consistency and no publicizing private storage for recovery. Evidence: actual synthetic IDs/checksums/counts/reference assertions and failure/recovery times. These bytes must be covered by database restoration.

## PA-WORKER — Worker/scheduler

Owner: INF/AO/DB/QA; status **BLOCKED**. Configuration/dependencies: real continuous supervisor, restricted NOSUPERUSER/NOBYPASSRLS TLS login, actual lease/retry settings, controlled canonical event/rule/action/destination and real organization-timezone scheduler cursor/hour. Scheduler runs inside existing worker, not an invented cron endpoint.

Execute CBS-019 twice: queued job, actual claim, identified worker interruption, actual lease expiry, one-worker restart, retry/success. Verify destination uniqueness and no duplicated financial/stock/notification/delivery effect, including uncertain provider acknowledgement. Execute due delayed/scheduled rule; pause/revoke actor before due and prove reauthorization. Drain gracefully, restore prior compatible worker/configuration as necessary. Evidence: actual execution/action/job/lease timing, scheduler cursor progression, heartbeat/backlog recovery and canonical history. Local retry tests do not certify hosted supervision.

## PA-MONITOR — Selected monitoring provider

Owner: INF/QA/SEC; status **BLOCKED**. Configuration/dependencies: real sink/health probes/metrics, approved alert/deduplication/delivery expectations, controlled authorized recipient route and accountable incident operator.

Execute CBS-024 individually for API/database/worker/email/automation/storage/Auth failures. Correlate actual request/job/provider IDs to logs/metrics and delivered alert; obtain real acknowledgement/recovery notification. Test sink/route interruption with actual safe staging control and document telemetry gap/recovery. Verify worker heartbeat/backlog, database connections/slow queries and email retry/rejection metrics. Privately inspect logs for secret/PII redaction; tenant actors cannot read protected platform telemetry. Evidence: actual event/alert/acknowledgement/recovery IDs/times. Console output is not monitoring delivery proof. No alerts are sent by this preparation task.

## PA-BACKUP — Backup/restore/PITR

Owner: DB/SB/INF/QA; status **BLOCKED**. Configuration/dependencies: actual provider plan/capability, real backup ID/time, observed retention/access/encryption and retrieval rights, known synthetic committed markers/financial/stock/media checksum inventory, different isolated restore destination and outbound services paused.

1. Verify real successful retrievable backup and actual retention/encryption/access. Do not infer retention from a product name or permission from a listed backup.
2. Restore via actual supported provider workflow into isolation, preserving original staging/production. Bind new project/secrets independently; verify schema/history/catalog/types/functions/RLS, known rows/foreign keys/ledger balances/immutable snapshots/private bytea checksums and Auth/app connectivity.
3. If PITR is actually available/required, select an observed pre/post-marker transaction point and verify committed-row inclusion/exclusion. Unsupported optional PITR is documented with owner review; critical restorable recovery is still mandatory.
4. Record actual recovery cutoff/newest recovered committed marker, data loss interval (RPO), restore-start to canonical/security-verified usable service (RTO), setup versus recovery timing and limitations. Targets require actual DB/BIZ approval; no invented values or SLA.
5. Resume one controlled worker only after consistency/security checks, verify outstanding leases and duplicate safety, record cutover rehearsal and healthy state. Integrity/isolation failure stops release and keeps failed restore isolated.

Evidence: real sanitized backup/restore/PITR IDs, marker/count/checksum comparisons, measured times and DB/SEC/QA signatures. Private dumps and Auth/config secrets stay outside Git. Historical local dump/restore is not provider evidence. External object bytes need separate recovery only if an external adapter is actually deployed later.

## Failure control and sign-off

Any critical failed drill stops its release gate. Classify root cause, preserve before evidence, repair actual layer, assign new RC on source change and retest failed plus related canonical/security cases with explained after evidence. Documented provider plans can be preparation PASS while all actual provider outcomes remain BLOCKED. Follow existing [recovery runbook](PROVIDER-RECOVERY.md), [release checklist](RELEASE-CHECKLIST.md) and [hosted contract](HOSTED-ENVIRONMENT-REQUIREMENTS.md).
