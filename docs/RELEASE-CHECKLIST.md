# Release checklist

Candidate: `rc/2026-10-05-phase11d.3`. Each result must bind full SHA, artifact, migration state, environment/project, UTC date, tester/owner and sanitized evidence. A checkbox or local baseline is not hosted evidence. Current production decision: **NO-GO**.

| Section           | Required release proof                                                                                                      | Current gate                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| SOURCE            | Immutable exact commit/tag, clean checkout, frozen install and private artifact checksums; no local-only required file      | Local verification recorded in manifest; hosted binding BLOCKED |
| DATABASE          | 103-migration history/catalog/types, 89 protected digests, approved migration plan and hosted integrity                     | BLOCKED                                                         |
| AUTH              | Real confirmed identities, session/recovery/expiry/revocation and controlled mail receipt                                   | BLOCKED                                                         |
| SECURITY          | Auth/RLS/RBAC/entitlements/IDOR/XSS/CSRF/SSRF/SQL injection/upload/storage/PDF/email/automation/worker/domain/secret review | BLOCKED                                                         |
| STORAGE           | Actual private bytea adapter boundaries, failures and recovered asset consistency                                           | BLOCKED                                                         |
| EMAIL             | Verified sender, actual delivery, bounce/rejection/rate limits/outage/rotation/retry                                        | BLOCKED                                                         |
| WORKER            | Restricted login, supervision, queued job, lease/crash/restart/idempotency and graceful drain                               | BLOCKED                                                         |
| AUTOMATION        | Actual event/rule/condition/action/notification/history/retry and duplicate-event proof                                     | BLOCKED                                                         |
| WEBSITE           | Create/edit/preview/publish/public enquiry/CRM, version rollback, draft isolation and SEO                                   | BLOCKED                                                         |
| BROCHURE          | Create/edit/preview/PDF/publish/enquiry/rollback, private assets and module independence                                    | BLOCKED                                                         |
| PDF               | Valid parsed output, immutable snapshot, authorization, offline renderer and bounded resource use                           | BLOCKED                                                         |
| REPORTS           | Canonical filters/totals/currency/permissions/pagination/export/PDF, including current-source reauthorization               | BLOCKED                                                         |
| PERFORMANCE       | Approved representative dataset/budgets and actual API/dashboard/PDF/public/worker measurements                             | BLOCKED                                                         |
| BACKUP            | Actual provider backup availability/retention/encryption/retrieval and isolated restore                                     | BLOCKED                                                         |
| MONITORING        | Real sink and owned alert delivery/recovery for seven failure categories                                                    | BLOCKED                                                         |
| DEPLOYMENT        | Recorded hosted artifacts/SHA, environment separation, health/readiness, DNS/TLS and supervisor                             | BLOCKED                                                         |
| ROLLBACK          | Prior artifact against current schema, worker drain/restart, forward repair or isolated recovery if incompatible            | BLOCKED                                                         |
| SMOKE TEST        | Staging smoke and, after authorized controlled production deployment, existing read-only production smoke                   | BLOCKED                                                         |
| BUSINESS SIGN-OFF | Actual BIZ approval against all 25 canonical outcomes                                                                       | BLOCKED                                                         |
| FINAL GO/NO-GO    | Five readiness approvals and accountable RO decision; no blocked critical gate                                              | **NO-GO**                                                       |

## Fifteen hard gates

Evaluate in order: **1 Build; 2 Tests; 3 Security; 4 Migration; 5 Hosted infrastructure; 6 Auth; 7 RLS; 8 Email; 9 Worker; 10 Backup/recovery; 11 Rollback; 12 Monitoring; 13 Performance; 14 Smoke; 15 Business approval.** The local build/test subgates may PASS; their hosted counterparts remain BLOCKED. No critical gate may be waived because an unrelated gate passed. Security criticals, Auth, tenant isolation, financial authorization, private data and critical recovery prohibit Conditional GO.

## Execution order

1. RO assigns actual owners, pins clean RC commit and reviews private provider inventory/fixture plan; run configuration preflight without accepting its success as hosted PASS.
2. INF deploys the environment-specific immutable staging artifacts; DB/SB apply approved migrations separately through the actual provider workflow.
3. Verify real health/readiness and migration/history/catalog; then genuinely confirmed Auth, A/B RLS, roles and entitlement variants, followed by private media boundaries.
4. Execute CBS-001–018 in [canonical scenarios](CANONICAL-BUSINESS-SCENARIOS.md), preserving state/linkage expectations and independent denials.
5. Verify actual automation/email/worker and reports/PDF; execute CBS-019–024 provider failure/backup/restore/rollback/monitoring drills only on isolated staging, restoring healthy state between drills.
6. Execute CBS-025 measured load, then related security regression. Run `pnpm acceptance:hosted --env-file=.env.acceptance.local` and reconcile every required coverage ID with scenario evidence; do not mistake incomplete automation for complete manual acceptance.
7. RO reconciles failed/blocked cases, source/environment identity, compatibility and all readiness signatures. An authorized controlled production deployment and read-only smoke require a separate recorded change decision; no production deployment is performed by this task or harness.
8. BIZ and RO record business approval and final verdict. Production remains NO-GO until all critical evidence and approvals exist.

The harness's internal order is in ACCEPTANCE-RUNBOOK.md; it performs read-only migration checks, not deployment/migration/recovery itself. Operator execution order surrounds the command and cannot be replaced with one fabricated provider endpoint.

## Failure and retest rules

Stop the release gate on any critical failure. Classify it as CODE, CONFIGURATION, INFRASTRUCTURE, PROVIDER, DATA, SECURITY, TEST or DOCUMENTATION, assign owner and preserve sanitized before evidence. The harness's existing static error categories map to these operational classifications; retain original codes too. Repair the actual failing layer without weakening assertions, RLS or bounds. A source fix creates a new RC. Retest the failed scenario and related regression/security cases; record changed inputs, root cause, after evidence and why a retry is justified. Never rerun repeatedly until green without an explanation.

## Security sign-off detail

SEC must explicitly sign each of: authentication/recovery/session revocation; tenant RLS and checked RPCs; RBAC/branch/project scope; entitlement and limit bypass; IDOR/download/export; escaped public/admin XSS; CSRF/session origin; SSRF/media/PDF external requests; validated SQL/RPC input; type/byte/size/ownership upload controls; private bytea media and public revocation; bounded offline PDF; email recipient/consent/idempotency; automation actor reauthorization; restricted worker/lease behavior; DNS/TLS/public capabilities; and source/browser/server/evidence secret scans. Every check needs real applicable evidence. Any authentication bypass, tenant leak, service-role exposure, unauthorized finance mutation, private disclosure or critical code execution is an immediate NO-GO.
