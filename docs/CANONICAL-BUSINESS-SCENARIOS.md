# Canonical business acceptance scenarios

These 25 scenarios are the authoritative end-to-end release plan for `rc/2026-10-05-phase11d.3`. **Every hosted scenario is currently BLOCKED.** They reference existing implementation/tests rather than duplicate module test code or introduce business behavior. Documentary plan completion is not executed acceptance or a complete automated JSON suite.

## Execution contract for every scenario

Preconditions for every CBS: assigned RO/QA, clean pinned RC checkout, verified staging project/origins/remote marker and registered A/B tenants, real confirmed actors, exact migration state and required entitlements/provider controls. QA records those dependencies before proceeding. Use synthetic `ACCEPTANCE-<run-id>-...` records only, controlled recipients, captured real IDs and independently calculated decimal/currency/stock expectations. No demo UUID, private customer data or invented provider response.

For every scenario the restricted execution record must contain **Scenario ID, Purpose, Preconditions, Test data, Actor, Steps, Expected result, Database verification, Audit verification, Security verification, Cleanup, Owner and PASS/FAIL/BLOCKED** plus full RC SHA, project/environment, UTC start/end and sanitized evidence references. The sections below supply these fields. Shared cleanup: log out sessions; archive only marker-registered tenants using guarded cleanup; retain immutable financial/stock/audit/publication history; physical reset uses isolated provider recovery. Shared audit: verify recorded actor, organization, canonical entity/event, transition and UTC time through authorized audit/timeline operations; do not export raw personal fields. Shared security: positive fixture with the intended actor first, then actual unauthenticated/forbidden-role/foreign-tenant API attempts. A 500, empty prerequisite or network failure cannot count as authorization denial. Stop on any critical failure and follow RELEASE-CHECKLIST.md retest rules.

## CBS-001 — Organization

- Purpose: prove actual onboarding and membership lifecycle without fake identities.
- Preconditions/data/actor: common contract; ten confirmed users; platform admin creates A/B with scoped plans; Owner A administers a synthetic branch and USER_A membership.
- Steps: use canonical organization creation/provisioning; create branch; assign existing confirmed owner; invite existing controlled user, accept invitation, assign role; switch to A; suspend membership, attempt protected access, restore membership and retry. Do not invent invitation-email delivery.
- Expected: correct tenant context and branch/role grants; suspension denies current-session/API access; restoration restores only intended grants; platform rights remain separate.
- Database: organizations, branches, organization memberships/role bindings have actual captured IDs and no foreign references; last-owner protections remain effective.
- Audit: creation/invite/accept/role/status transitions attributed to actual callers.
- Security: USER_A cannot administer B or acquire platform permissions; foreign branch/organization switching fails with authorization denial.
- Cleanup/owner/status: shared archival cleanup; QA executes, AO/SB consulted, RO accountable; **BLOCKED**.
- Reference: PHASE1-VERIFICATION.md; existing live-auth suite; harness provision/Auth/isolation checks.

## CBS-002 — Customer/CRM

- Purpose: prove one coherent enquiry-to-outcome chain and follow-up behavior.
- Preconditions/data/actor: CBS-001; CRM settings and permissions; synthetic controlled contact, source, open/won/lost stages and assignee; USER_A salesperson and Owner A. Real worker/notification configuration required for reminder proof.
- Steps: create customer and linked lead; assign; append activity; schedule follow-up and reminder; complete follow-up; change open stage; mark one lead won and a separate one lost with required reason. Observe due reminder/notification/authorized automation.
- Expected: canonical customer/lead linkage, timeline and next-follow-up derived correctly; no lost/won ambiguity or duplicate reminder; email only when configured/consented.
- Database: leads, activities, follow-ups and existing outbox/notification references reconcile; conversion retries preserve mappings where used.
- Audit: stage, assignment, activity and completion actor/history retained.
- Security: inaccessible lead/assignee, role changes and B IDs denied through APIs; notifications visible only to authorized recipient.
- Cleanup/owner/status: shared cleanup; QA/AO with BIZ expected-outcome review; **BLOCKED**.
- Reference: CRM.md, CRM-FOLLOWUPS.md; live-crm.spec.ts; local CRM assertions.

## CBS-003 — Quotation

- Purpose: verify historical pricing and one authorized issued customer response.
- Preconditions/data/actor: CBS-002 customer/project, configured catalog/questions/rates and signing key; Owner A/salesperson, controlled anonymous customer capability. Independently record selected rate/version/rounding and decimal expected total before issue.
- Steps: create project/area and draft quote; answer questions, select catalog items, calculate; issue immutable revision, render/download PDF; change current catalog price; clone/edit/issue subsequent revision; compare prior snapshot; share through existing capability, record accept/reject on separate controlled revisions as allowed.
- Expected: correct exact total and snapshot, historical rates unchanged, current revision lifecycle correct; valid parsed PDF without internal costs; configured response and expiry/revocation rules enforced.
- Database: quotations/revisions/items, detached pricing snapshot and customer-response records agree; no unexpected current-price rewrite.
- Audit: issue/revision/share/response events retain caller/time and source revision.
- Security: unauthorized issue/edit/PDF denied; forged/expired/mismatched capability fails; renderer makes no external requests.
- Cleanup/owner/status: revoke controlled shares, retain issued snapshots then shared cleanup; QA/AO, BIZ totals; **BLOCKED**.
- Reference: QUOTATIONS.md, QUOTATION-SNAPSHOTS.md, CUSTOMER-APPROVAL.md; live-crm/catalog and finance prerequisites.

## CBS-004 — Contract

- Purpose: prove the implemented accepted-quotation handoff and permitted state machine.
- Preconditions/data/actor: CBS-003 accepted issued response; Billing/Projects enabled; contract-create/manage permission; Owner A/Accounts as allowed.
- Steps: create contract from accepted revision, retry creation; activate, hold with reason, resume; inspect project link and accepted scope. Test completion/cancellation/closure only with the exact documented prerequisites and separate fixtures; never imply completion is financial settlement.
- Expected: one contract per source revision, frozen original value/scope, valid optimistic version/transitions; closure refuses unsettled/draft/unresolved records.
- Database: contract identity/source snapshot/project, unique source revision, state/version and approved variation-derived current value agree.
- Audit: creation/hold/resume and rejected invalid changes remain explainable; actor and reasons retained.
- Security: unavailable contract/project or billing entitlement denies direct operations; B source reference rejected.
- Cleanup/owner/status: retain contract/financial history; shared cleanup; QA/AO/DB, BIZ workflow; **BLOCKED**.
- Reference: CONTRACTS.md; live-finance.spec.ts.

## CBS-005 — Billing

- Purpose: prove offline money integrity and reminders without a fabricated gateway.
- Preconditions/data/actor: active CBS-004 contract, enabled payment method/tax configuration; Accounts actor; exact currency/precision and approved invoice total. Use separate unpaid overdue fixture and safe due date.
- Steps: draft/issue tax invoice within contract cap, retry issue; record partial offline payment/allocation then remainder with distinct idempotency keys; inspect balance/receipt; observe overdue unpaid fixture and configured reminder. Exercise invalid over-allocation and retry payload mismatch.
- Expected: exact partial/paid/overdue states; zero final balance only after actual allocations; one receipt per payment; failed allocations atomic; reminders do not alter invoice; no online gateway or refund implied.
- Database: immutable invoice/receipt snapshots, payments/unreversed allocations, contract ceilings and per-currency totals independently reconcile.
- Audit: issue/payment/allocation/reminder lifecycle and actor preserved.
- Security: independent invoice/payment/report grants, foreign invoice/contract, public PDF and stale versions denied.
- Cleanup/owner/status: retain finance history; shared cleanup; QA/DB/Accounts role with BIZ sign-off; **BLOCKED**.
- Reference: BILLING.md, PAYMENTS.md; finance SQL/live-finance.

## CBS-006 — Procurement

- Purpose: verify canonical demand, commitments and partial receipts.
- Preconditions/data/actor: accepted contract, approved execution estimate, material/unit and recorded vendor; Project Manager plus authorized procurement/cost actor; known quantity/currency/cost basis.
- Steps: select estimate lines into requisition; create RFQ, record vendor quote, compare facts; create/approve/issue PO via existing workflow; receive a partial accepted quantity and a rejected quantity. Retry issue/receipt and exercise over-order/over-receipt.
- Expected: preserved estimate→requisition→RFQ→quote→PO→receipt links; commitments cannot exceed demand; accepted material alone is eligible for stock. Do not invent separate PO approval if issue is the implemented permission-checked transition.
- Database: source allocations, PO commitments and accepted/rejected quantities/costs reconcile; retries do not multiply demand.
- Audit: canonical issue/receipt/approval events and actor history retained.
- Security: B references, unauthorized cost access, branch-only bypass and disabled entitlements denied.
- Cleanup/owner/status: preserve issued receipts/PO history; shared cleanup; QA/AO/DB and BIZ cost review; **BLOCKED**.
- Reference: PROCUREMENT.md, PURCHASE-ORDERS.md; live-execution.spec.ts.

## CBS-007 — Inventory

- Purpose: verify append-only quantity/cost accounting and concurrent commands.
- Preconditions/data/actor: CBS-006 accepted receipt lot, store/site location and approved project request; Store Manager scoped role; exact test lot of 100 units.
- Steps: post accepted receipt once; issue 30 to site; consume 20, return 5, scrap 2; verify store 75/site 3; add a separate reasoned adjustment and verify its signed effect; repeat same idempotency payload; submit competing bounded issue/consume attempts from separate authenticated sessions.
- Expected: immutable signed movements, no negative stock, exactly one command result for repeated key; competing commands serialize. Reject changed retry payload; costs retain receipt-lot basis. Unsupported transaction variant is recorded explicitly, not invented.
- Database: sum movements by lot/location, transaction legs, source receipt, cost allocation and material request; record exact independent decimals.
- Audit: commands/reversal reasons/actor preserved; ledger is never edited/deleted.
- Security: stock/cost permissions separated; foreign lot/location/project and excess quantity denied.
- Cleanup/owner/status: no ledger purge; shared cleanup; QA/DB with Store Manager and BIZ review; **BLOCKED**.
- Reference: INVENTORY.md, MATERIAL-CONSUMPTION.md; local operations concurrency and live-operations.

## CBS-008 — Project execution

- Purpose: verify physical plan, task state and due-work visibility.
- Preconditions/data/actor: CBS-004 project/approved plan, task/milestone permissions and real worker; Project Manager and assigned Site Supervisor; synthetic future, blocked and overdue tasks.
- Steps: create physical plan/milestone/tasks; assign permitted supervisor; mark task blocked with cause, unblock/start/complete through existing transitions; inspect an independently overdue incomplete task; observe notification/automation/timeline.
- Expected: completion follows prerequisites, overdue excludes completed/cancelled tasks, authorization rechecked on reassignment; no automatic commercial closure.
- Database: task/milestone/plan linkage, versions/status and outbox/job/source IDs consistent.
- Audit: assignment/state changes and actual recipient/actor attribution checked privately.
- Security: unassigned/revoked actor and B project denied through direct API.
- Cleanup/owner/status: shared cleanup; QA/AO, Project Manager/BIZ outcome; **BLOCKED**.
- Reference: PROJECT-EXECUTION.md; live-operations.spec.ts.

## CBS-009 — Inspection/snag

- Purpose: verify frozen checklist, failed inspection and successor reinspection.
- Preconditions/data/actor: CBS-008 plan, mandatory inspection template and snag permissions; Site Supervisor/authorized approver; one critical failed item.
- Steps: create inspection snapshot; fail/approve with required evidence; record required snag via existing canonical operation; assign; retry the same defect operation and verify no duplicate; resolve through valid state; reinspect using successor snapshot, approve passed result.
- Expected: prior inspection immutable; required items enforced; no duplicate snag on idempotent retry; template edits do not rewrite successor requirements.
- Database: inspection snapshots/results, predecessor link, unique defect linkage and append-only snag history.
- Audit: failure/assignment/resolution/reinspection/approval callers and times checked.
- Security: unauthorized approval or foreign plan/inspection/snags denied; notifications restricted.
- Cleanup/owner/status: preserve finalized checks; shared cleanup; QA/AO, BIZ; **BLOCKED**.
- Reference: INSPECTIONS.md, SNAGS.md; operations SQL.

## CBS-010 — Handover

- Purpose: prove readiness gates and explicit physical completion.
- Preconditions/data/actor: CBS-008/009, handover checklist and approval permission; Project Manager/authorized approver; critical unresolved snag negative fixture.
- Steps: enter handover preparation; attempt approval with critical snag/open tasks/failing mandatory inspection; resolve each actual prerequisite; complete checklist, material/commercial review notes, staff-entered acknowledgement/warranty where configured; explicitly approve, then complete physical plan through its supported command.
- Expected: mandatory gates deny premature handover; actual approval freezes customer-facing snapshot; no automatic commercial contract settlement/closure or customer-signature claim.
- Database: handover/checklist snapshot, passed latest inspections and resolved snag/task state; physical and commercial status remain distinct.
- Audit: readiness review, approval and explicit completion actor/time.
- Security: unauthorized/foreign approvals and customer PDF leaking internal costs/review notes denied.
- Cleanup/owner/status: preserve finalized history; shared cleanup; QA/AO/DB, BIZ; **BLOCKED**.
- Reference: HANDOVER.md; operations SQL and PDFs.

## CBS-011 — Website

- Purpose: prove draft-to-public snapshot and real enquiry linkage.
- Preconditions/data/actor: Website enabled, scoped developer/owner, server/database matching signing key and public origin; controlled synthetic enquiry.
- Steps: create/edit pages and SEO, preview as authorized actor; assert public draft denial; publish version A, fetch actual public route/robots/sitemap; submit consented enquiry and locate canonical CRM record; edit/publish B, use existing version rollback/republication of A and recheck current public projection.
- Expected: only active published snapshot served; no draft/internal source/cost exposure; enquiry respects validation/honeypot/limits; draft changes do not mutate published version.
- Database: website/page/build/publication/media and linked lead/outbox data match captured IDs.
- Audit: edit/publish/rollback/enquiry transition evidence through existing authorized views.
- Security: B authoring/media, unauthenticated draft access, revoked developer and disabled entitlement denied; sandbox/public origin boundary holds.
- Cleanup/owner/status: unpublish/remove disposable domain mapping, shared cleanup; QA/AO/DNS; **BLOCKED**.
- Reference: WEBSITE-BUILDER.md, WEBSITE-SECURITY.md; live-website.spec.ts.

## CBS-012 — Brochure

- Purpose: verify independent brochure publication and secure PDF/media/enquiry.
- Preconditions/data/actor: Website disabled/Brochure enabled fixture, designer/owner, valid build keys/public origin, synthetic private image and controlled contact.
- Steps: create/edit layout, preview, render parsed PDF; assert draft public denial; publish A, fetch viewer/PDF/referenced assets; submit consented enquiry into CRM; publish B then restore prior version through existing rollback/republication; verify revocation/unpublish.
- Expected: independent module operation, historical snapshot retained, public settings and download restrictions enforced; no private source/current draft exposed.
- Database: brochure revisions/builds/media/publication/enquiry/lead references consistent; bytes belong to private database storage.
- Audit: edit/render/publish/revoke/rollback actor and real events, not browser visibility alone.
- Security: foreign assets/draft/PDF, expired share and revoked designer/entitlement denied.
- Cleanup/owner/status: revoke publication/capabilities, preserve history, shared cleanup; QA/AO; **BLOCKED**.
- Reference: BROCHURE-PUBLIC.md, BROCHURE-PDF.md; live-brochures.spec.ts.

## CBS-013 — Automation

- Purpose: prove canonical event/rule/action/history/retry and duplicate safety.
- Preconditions/data/actor: real worker and scoped rule owner/recipient permissions, consent for mail; synthetic canonical lead/task event and supported allowlisted condition/action.
- Steps: create rule, perform canonical mutation, observe actual transactional event and worker action; notify/remind and send configured email only where authorized; retrigger same event through supported retry/idempotency path; induce one safe transient failure, inspect history then authorized retry; revoke source permission and test denial.
- Expected: one intended action/notification/delivery per idempotency identity; bounded retries/history; actor/recipient authorization rechecked. No financial/inspection/handover approval is invented as an action.
- Database: outbox/rule revisions/jobs/actions/notifications/deliveries and canonical destination IDs reconcile.
- Audit: event source/actor/action chain and manual retry history retained.
- Security: caller cannot fabricate trusted events or invoke worker entrypoints; cross-tenant/rule-owner bypass denied.
- Cleanup/owner/status: pause rules/drain controlled worker, preserve history, shared cleanup; QA/AO/INF/MAIL; **BLOCKED**.
- Reference: AUTOMATION.md, AUTOMATION-SECURITY.md; live-automation.spec.ts.

## CBS-014 — Reporting

- Purpose: verify canonical totals and protected snapshots across requested domains.
- Preconditions/data/actor: CBS-002–013 deterministic dataset and independently known totals/currency/stock; report-family/export grants; authorized role and denied-role actors.
- Steps: generate CRM, sales/quotation, billing, receivables, projects, procurement, inventory, execution and combined snag/handover sections; filter by represented date/project/customer/status; paginate; export CSV/PDF and parse; change source then compare prior immutable snapshot; revoke source access and retry download.
- Expected: canonical totals and per-currency distinctions, cumulative inventory/cost semantics, bounded pagination/5,000-row export and formula-neutralized CSV; correct PDF; revoked access denies historical download. Requested domains map to existing families, not invented separate report engines.
- Database: snapshot filters/basis/renderer/generation identity, row counts and source calculations independently reconcile.
- Audit: generation/export/download evidence available through existing audit/operation records; absence of a promised audit event is documented, not fabricated.
- Security: family/export/cost/assignment and B record restrictions checked by APIs/PDF, not menu hiding.
- Cleanup/owner/status: retain safe immutable snapshot, shared cleanup; QA/DB/AO with BIZ totals; **BLOCKED**.
- Reference: REPORTING.md; reporting SQL/export unit/browser tests.

## CBS-015 — Auth recovery

- Purpose: prove real hosted recovery and session security in both admin apps.
- Preconditions/data/actor: real confirmed owner/platform identities, Auth SMTP/verified sender/controlled inbox and allowlists; distinct new passwords delivered securely; optional natural-expiry control access.
- Steps: login/logout/refresh; request recovery via UI, retrieve actual correctly addressed email, follow correct HTTPS link, reset; verify new login and old password denial; replay token, submit invalid token and wait actual configured expiry for a fresh token.
- Expected: neutral unknown-account responses, Secure/HttpOnly/SameSite cookies, revoked refresh sessions, no reused/invalid/expired reset. Actual inbox receipt required; API acceptance alone is insufficient.
- Database: authorized Auth identity/session state and profile/membership remain consistent; never export password/token hashes.
- Audit: actual provider request/message/session identifiers and times stored privately, sanitized references publicly.
- Security: scanner-safe landing, origin/purpose/expiry controls, no credential/token logs; access JWT expiry policy explicitly reviewed.
- Cleanup/owner/status: revoke sessions/update controlled-password secret store; QA/SB/MAIL/SEC; **BLOCKED**.
- Reference: AUTH-RECOVERY.md; existing real inbox recovery adapter. Longer-than-supported expiry requires supervised manual evidence, not a forged clock.

## CBS-016 — Tenant isolation (critical)

- Purpose: prove complete A/B boundaries including direct API and files.
- Preconditions/data/actor: A/B each have real positive fixtures from previous scenarios; Owner A/B and scoped staff; valid own-tenant download/export capabilities captured privately.
- Steps: verify B can read/write its fixture; with A identity substitute B IDs into read/create/update/delete and relationship payloads, media/download/export/notification/automation/report/PDF operations. Test anonymous and stale/revoked capabilities. Capture exact authorization codes, not generic failure.
- Expected: every unauthorized operation denied without side effect; list reads omit foreign rows only after positive fixture proof; immutable delete rejection remains separate from tenant denial.
- Database: B records, ledgers, notification recipients, job/action/snapshot/media references unchanged; constraints and forced RLS intact.
- Audit: access/denial evidence and actual B mutation count before/after; do not claim every denied request creates a business audit event.
- Security: critical IDOR/tenant boundary across all implemented domains; any leak stops release immediately.
- Cleanup/owner/status: shared cleanup; QA/SEC/DB accountable security review; **BLOCKED**.
- Reference: harness isolation checks plus per-domain RLS SQL/live cases; the 18 table probes alone are not this full matrix.

## CBS-017 — Role isolation

- Purpose: prove allowed/forbidden actions for key roles after live grant changes.
- Preconditions/data/actor: controlled platform admin, owner, sales/user, Accounts, Project Manager, Site Supervisor, Store Manager, Website/Brochure actor; separate designer/sales identities if live suite needs them.
- Steps: record exact configured grants; execute each role's intended canonical mutation/read; attempt owner/platform/finance/cost/export/media actions without grant through direct API; revoke/reassign role and repeat existing-session access.
- Expected: allowed positive action succeeds only with correct scope; forbidden operations and platform/tenant privilege escalation denied immediately; last-owner rule preserved.
- Database: actual membership/role/permission/assignment bindings, no unauthorized grants or side effects.
- Audit: grant/revoke/status actor/time and stale-session denied request references.
- Security: UI hiding not evidence; project/branch scope and platform rights separately tested.
- Cleanup/owner/status: restore reviewed grants then shared cleanup; QA/SEC/AO; **BLOCKED**.
- Reference: PERMISSIONS.md, actual role templates/custom roles and hosted browser opt-ins.

## CBS-018 — Entitlement

- Purpose: prove enabled/disabled/limited behavior under actual plan variants.
- Preconditions/data/actor: A/B controlled plans/overrides with independently reviewed limits; platform admin changes plans, owner/staff perform allowed actions.
- Steps: exercise enabled module; disable/revoke and retry same API/private/public/PDF route; configure finite limit, create up to limit then attempt excess; try direct API bypass; restore intended plan and retest.
- Expected: canonical checks deny disabled/excess behavior without data side effects; Brochure independence from Website remains; no plan string alone substitutes for effective entitlement.
- Database: effective entitlement windows/overrides and measured usage agree; no unauthorized increments/public access after revocation.
- Audit: real platform plan/override changes and caller identity retained.
- Security: tenant user cannot alter plan/platform grants; races cannot bypass hard limit.
- Cleanup/owner/status: restore scoped plans, shared cleanup; QA/SEC/AO/SB; **BLOCKED**.
- Reference: PHASE1/8/9/10 verification and harness required entitlement IDs.

## CBS-019 — Worker failure

- Purpose: prove real supervisor restart and leased-job idempotency.
- Preconditions/data/actor: isolated staging, restricted login, actual supervisor stop/restart controls and controlled destination; INF operates, QA observes actual job/execution IDs.
- Steps: queue real canonical work, start worker, observe claim; stop only identified staging process after claim; wait actual lease expiry; restart one worker, observe retry/success; repeat restart and compare destination/action counts.
- Expected: no silent lost work or duplicate canonical effect; unknown mail acknowledgement reconciled via provider idempotency, not force-sent.
- Database/audit/security: job lease/attempt/action/history and unique destination counts; worker identity NOSUPERUSER/NOBYPASSRLS; public entrypoint denial and sanitized logs.
- Cleanup/owner/status: restore supervisor and paused rules after verification; INF/AO/QA; **BLOCKED**.
- Reference: PROVIDER-RECOVERY.md; existing worker CLI/local retry evidence is not hosted proof.

## CBS-020 — Database recovery

- Purpose: verify actual provider backup/restore/PITR and recovered connectivity.
- Preconditions/data/actor: provider-supported backup/plan, authorized retrieval, different isolated project, controlled marker data and asset checksum manifest; DB/SB operate, QA validates; outbound services paused.
- Steps: record real backup/recovery point; restore to isolated target using selected provider procedure; verify migration/schema/functions/RLS/types, known committed rows/bytea assets, Auth/config bindings and application connectivity; measure newest recovered commit and usable-service time.
- Expected: exact canonical finance/stock/publication consistency, tenant security and authorized media recover; original target untouched; actual RPO/RTO recorded, no invented target or PITR capability.
- Database/audit/security: history/catalog, foreign keys, ledgers/snapshots/checksums, actual recovery operation ID and operator; no production restore rehearsal or exposed dump.
- Cleanup/owner/status: isolate failed restore, archive/delete disposable target only by separately reviewed provider operation; DB/SB/QA/INF; **BLOCKED**.
- Reference: PROVIDER-ACCEPTANCE-SCENARIOS.md, PROVIDER-RECOVERY.md.

## CBS-021 — Deployment rollback

- Purpose: prove immutable current/prior application and worker compatibility.
- Preconditions/data/actor: real staging hosting, saved A/B artifact SHA/digests/environment, current schema compatibility and supervised drain; INF/AO/DB.
- Steps: deploy A and verify; deploy B and verify; drain worker, roll back to A using actual provider operation; verify health/Auth/canonical read and bounded mutation/security/worker; record duration. If schema-incompatible, stop and rehearse approved forward repair/isolated recovery instead.
- Expected: retained schema/history, compatible old artifact, no duplicated queued effect; no invented down migration or automatic provider support.
- Database/audit/security: migration history unchanged except explicitly approved additive work; deployment operation IDs, logs and actual release bindings; secrets remain scoped.
- Cleanup/owner/status: restore approved healthy staging artifact; INF/RO with AO/DB; **BLOCKED**.
- Reference: OPERATIONS-RUNBOOK.md and selected provider inventory.

## CBS-022 — Email provider failure

- Purpose: prove committed business operation survives external mail failure.
- Preconditions/data/actor: verified sender, controlled inbox, real safe provider reject/outage controls and worker retry inventory; MAIL/INF, QA and actual business actor.
- Steps: induce approved staging provider failure; perform canonical business action; inspect commit and failed/pending delivery; restore provider; invoke existing retry/lease workflow; retrieve real controlled message; repeat retry and verify no duplicate receipt.
- Expected: business transaction remains committed, bounded failure visible, eventual delivery reconciled by actual provider ID; no fake SMTP or silently marked sent.
- Database/audit/security: source/outbox/delivery/attempt/consent state; canonical and provider events correlated; recipient/actor permissions rechecked before send.
- Cleanup/owner/status: restore real provider config, drain controlled backlog, shared cleanup; MAIL/AO/QA; **BLOCKED**.
- Reference: existing Resend adapter, EMAILS.md and provider plan.

## CBS-023 — Storage failure

- Purpose: verify current database-media failure handling and business consistency.
- Preconditions/data/actor: actual private bytea adapter, owned synthetic asset, safe isolated database/media failure control and backup; AO/DB/INF, authorized uploader and B denial actor.
- Steps: induce approved upload failure, verify no dangling committed asset reference; induce download/media database unavailability, verify generic bounded failure; restore real connectivity and refetch authorized bytes/current publication; compare checksums and references.
- Expected: consistent records/bytes, no publicizing media or dangling successful upload; recovery restores current authorized capability behavior. External object-store outage is NOT APPLICABLE because no adapter exists.
- Database/audit/security: media ownership/ref counts/checksums and canonical operation/audit evidence; foreign/private asset denied before/after.
- Cleanup/owner/status: restore database/media path, retain referenced historical bytes, shared cleanup; AO/DB/QA; **BLOCKED**.
- Reference: WEBSITE-SECURITY.md, BROCHURE-SECURITY.md and backup drill.

## CBS-024 — Monitoring

- Purpose: prove actual detection, owned alerts and recovery notification.
- Preconditions/data/actor: deployed monitoring sink/alert route, agreed routing and safe isolated controls; INF operator, QA, DB/MAIL for dependent failures.
- Steps: generate controlled API, database, worker, email, automation, storage and Auth failures individually; correlate each real request/job/provider ID to sink and alert; acknowledge via accountable operator; recover and confirm recovery signal; inspect log payloads privately for secrets.
- Expected: all seven categories detected and delivered to actual owned route; no console-only substitute, duplicate storm or exposed credential/customer body. Thresholds/delivery expectations must be approved before test.
- Database/audit/security: canonical state/queue/lease/health recovers consistently; actual monitoring event/alert IDs and timestamps; protected platform telemetry remains inaccessible to tenant staff.
- Cleanup/owner/status: restore each control and acknowledge test alerts with provenance; INF/QA/SEC; **BLOCKED**.
- Reference: OPERATIONS-RUNBOOK.md, SECURITY-RUNBOOK.md and real monitoring provider inventory.

## CBS-025 — Performance

- Purpose: measure representative service capacity without fabricated budgets.
- Preconditions/data/actor: isolated staging, approved synthetic dataset size/concurrency/resource allowance and independently known results; INF/QA/AO; controlled signed-in owner and real worker.
- Steps: measure API, authenticated dashboard, CRM, quotation, reports, actual protected PDF, public website/brochure and worker completion latency; capture sample count/status/response timings and CPU/memory/backlog; approved peak/concurrency scenario separately from sequential HTTP sampler.
- Expected: correct results under measured load, no redirects mistaken for dashboard success; actual P50/P95 and P99 only for sufficient samples; compare to owner-approved thresholds only. No asserted SLA or HTTP timing passed off as user paint.
- Database/audit/security: row/ledger/totals unchanged by read load, actual worker execution timing, no leaked telemetry/secrets; same auth/RLS/limit/renderer bounds under pressure.
- Cleanup/owner/status: stop load, drain approved jobs, record dataset ownership and guarded cleanup; QA/INF/AO, BIZ budget review; **BLOCKED**.
- Reference: existing performance runner, local Phase 10 timings labelled local, provider capacity inventory.

## Automation and evidence reconciliation

Map each actually executed assertion to the exact required IDs in `scripts/acceptance/coverage.mjs`. Preserve separate allowed/denied and provider/inbox/failure evidence; one CBS PASS cannot blanket-pass all IDs. Use existing live suites/canonical RPC shapes for authenticated cases, and approved manual provider steps when a real adapter is unavailable. Record unsupported implementations as NOT APPLICABLE only after AO/SEC review; missing configuration, provider procedure or test implementation is BLOCKED. Plans above can be marked preparation PASS after review, while all hosted outcome statuses remain BLOCKED until execution.
