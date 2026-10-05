# Release ownership

All human assignments are **NOT ASSIGNED**. Role placeholders define responsibility; they do not grant approval or invent people. The Release Owner must record an actual accountable person's identity and secure contact in the restricted release register before staging acceptance. Public evidence uses non-secret operator IDs, not email addresses. If one person fills several roles, list each role and the same actual operator ID explicitly; no such combination is assumed now.

| Role                                  | Responsibility                                                                                         | Assignment   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| Release Owner (RO)                    | Freeze RC, bind evidence, stop failed gates, coordinate approvals, final decision and incident handoff | NOT ASSIGNED |
| Application Owner (AO)                | Application correctness, worker integration, compatible artifacts and code fixes                       | NOT ASSIGNED |
| Database Owner (DB)                   | Migration review, schema/history/RLS integrity, backup validation and restore consistency              | NOT ASSIGNED |
| Security Owner (SEC)                  | Auth/isolation/permissions, secrets, threat review and residual-risk decision                          | NOT ASSIGNED |
| Infrastructure/Deployment Owner (INF) | Scoped builds/deployments, supervisor, rollback, capacity and observability                            | NOT ASSIGNED |
| Email Provider Owner (MAIL)           | Auth SMTP, business transport, verified sender, controlled inbox, rejection and recovery               | NOT ASSIGNED |
| Domain/DNS Owner (DNS)                | Authorized staging DNS, real TLS lifecycle and rollback/removal                                        | NOT ASSIGNED |
| Supabase Owner (SB)                   | Project inventory, managed Auth settings, database access, plan limits and supported recovery          | NOT ASSIGNED |
| QA/Acceptance Owner (QA)              | Controlled fixtures, canonical scenario execution, evidence and focused retests                        | NOT ASSIGNED |
| Business Sign-off Owner (BIZ)         | Verify existing workflow outcomes, monetary/stock expectations and acceptance limits                   | NOT ASSIGNED |

## RACI

R performs the work; A is the single accountable role; C is consulted; I receives the recorded outcome. The table assigns roles, not human approvals.

| Activity              | R           | A    | C                     | I                 |
| --------------------- | ----------- | ---- | --------------------- | ----------------- |
| Application release   | AO, INF     | RO   | QA, SEC               | BIZ, DB           |
| Database migration    | DB          | DB   | SB, AO, SEC           | RO, QA            |
| Auth                  | SB, QA      | SEC  | AO, MAIL              | RO                |
| RLS                   | DB, QA      | SEC  | SB, AO                | RO                |
| Storage/private media | AO, DB, QA  | SEC  | SB, INF               | RO                |
| Email                 | MAIL, QA    | MAIL | AO, SEC               | RO                |
| Worker                | AO, INF, QA | AO   | DB, MAIL              | RO                |
| Scheduler             | AO, INF, QA | AO   | DB                    | RO                |
| Backup                | SB, DB      | DB   | INF, SEC              | RO                |
| Restore               | SB, DB, QA  | DB   | INF, AO, SEC          | RO, BIZ           |
| Rollback              | INF, AO, DB | RO   | QA, SB                | SEC, BIZ          |
| DNS/TLS               | DNS, INF    | DNS  | SEC, QA               | RO                |
| Monitoring            | INF, QA     | INF  | AO, DB, MAIL          | RO                |
| Security              | SEC, QA     | SEC  | AO, DB, SB            | RO, BIZ           |
| Performance           | QA, INF     | AO   | DB, BIZ               | RO                |
| Production smoke      | QA, INF     | RO   | AO, SEC, DB           | BIZ               |
| GO/NO-GO              | RO          | RO   | AO, DB, SEC, INF, BIZ | MAIL, DNS, SB, QA |

## Required approvals

| Approval                 | Accountable signer | Required evidence                                                                  | Current status |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------- | -------------- |
| Technical readiness      | AO                 | RC-bound builds, full regression and canonical workflows                           | BLOCKED        |
| Security readiness       | SEC                | Hosted security/isolation results and reviewed advisory disposition                | BLOCKED        |
| Database readiness       | DB                 | Exact migration state, canonical integrity, restorable backup and isolated restore | BLOCKED        |
| Infrastructure readiness | INF                | Deployment, supervision, TLS, monitoring, rollback and capacity evidence           | BLOCKED        |
| Business readiness       | BIZ                | Reviewed canonical expected results, exports and existing workflow sign-off        | BLOCKED        |
| Final GO/NO-GO           | RO                 | All hard gates and five approvals above, dated decision and rollback ownership     | BLOCKED        |

Approval register fields: RC ID, full SHA, environment/project fingerprint, signer role/operator ID, UTC decision time, PASS/FAIL/BLOCKED, sanitized evidence references and accepted non-critical residual risk. Missing signature or evidence means BLOCKED. Configuration presence, documentation completion, local PASS or an automated exit code never signs on someone's behalf.
