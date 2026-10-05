# Delivery roadmap

Phase 7 scope is now physical project execution: planning, inventory, site work, subcontractors, inspection, snags and handover. Local implementation and checks are recorded, superseding the earlier future-pack placeholder below. See PHASE7-VERIFICATION.md for outstanding completion gates. Construction remains a generic-domain compatibility requirement; advanced warehouse, manufacturing, payroll, accounting and portal features remain deferred.

Each phase requires explicit scope and independent verification. Phase 0/1 are preserved. Phase 2 implements configurable catalogs, dependencies, effective rates, branch price books and deterministic finished-work previews. Local results and hosted verification boundaries are recorded in PHASE2-VERIFICATION.md. Phase 3 adds customers, commercial project containers, quotation revisions and protected documents. Phase 4 adds CRM pipelines, transactional conversion, secure quotation sharing and customer responses. Phase 5 adds accepted-contract commercial control, offline billing/payments and variations. Site execution and procurement remain deferred.

| Phase | Deliverable                                                                                                 | Exit gate                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0     | Workspaces, app shells, documentation, standards, checks                                                    | Formatting, lint, typecheck, unit tests, all builds and browser smoke tests                    |
| 1     | Supabase environments, tenant schema, sessions, memberships, branches, RBAC, entitlements and audit storage | Two-tenant/branch RLS and storage tests, spoofing/revocation tests, privileged boundary review |
| 2     | Generic configurable catalog and pricing engine; Interior seed pack                                         | Deterministic quantity, currency, modifier ordering, minimum rate and snapshot tests           |
| 3     | Customers, commercial project containers and quotation workflow                                             | Authorized end-to-end lifecycle and customer-safe projections                                  |
| 4     | CRM, lead conversion, secure quotation sharing and customer responses                                       | Tenant-safe sales workflow, immutable approval, exact revision sharing and concurrency tests   |
| 5     | Billing and commercial control plane                                                                        | Exact finance, frozen snapshots, offline allocation races, RLS and PDF checks                  |
| 6     | Internal execution estimates, materials, recipes, procurement and receiving                                 | Local checks complete; hosted Auth/PostgREST acceptance outstanding                            |
| 7     | Project planning, inventory, site work, subcontractors, inspections, snags and handover                     | Local checks passed; hosted acceptance pending                                                 |

Before enabling Phase 1 in a hosted environment: select region/hosting, apply migrations to a development Supabase project, configure Auth URLs/email, bootstrap the initial platform administrator and run the opt-in live browser checks. SQL tests cover PostgreSQL policy behavior but do not emulate Supabase Auth or PostgREST. No storage buckets or uploads are introduced; private Storage policies must be added and tested before uploads exist.

Phase 6 local implementation and verification are recorded in PHASE6-VERIFICATION.md. Phase 7 work and outstanding acceptance are tracked in PHASE7-VERIFICATION.md. Complete hosted acceptance using confirmed development accounts before declaring deployment readiness. Workforce attendance, payroll and advanced scheduling remain deferred.

## Phase 8 Website module

See [Website architecture](WEBSITE-ARCHITECTURE.md), [builder](WEBSITE-BUILDER.md), [security and permissions](WEBSITE-SECURITY.md) and [verification](PHASE8-VERIFICATION.md). Website is optional, uses separate immutable public snapshots and canonical CRM enquiries, and does not introduce Phase 9.

## Phase 9 Brochure module

The independent optional brochure implementation and local verification are tracked in [PHASE9-VERIFICATION.md](PHASE9-VERIFICATION.md). It includes fixed-layout authoring, reusable public brand content, shared media, immutable publication/PDF history, independent public viewing and canonical CRM enquiries. Hosted Auth/PostgREST acceptance remains a separate gate.

## Phase 10 Automation and reporting

The explicitly authorized Phase 10 introduces a transactional event outbox, one restricted central worker, structured rules, notifications/preferences, optional idempotent email, canonical work/approval queues, management reports and protected snapshot exports. See [automation](AUTOMATION.md), [reporting](REPORTING.md) and [verification](PHASE10-VERIFICATION.md). Preserve all prior domain systems and migrations. Hosted acceptance and provider delivery are separate gates.

## Phase 11 production hardening

Phase 11 is now authorized for hardening and verification of the existing system. See [verification](PHASE11-VERIFICATION.md), [hosted acceptance](HOSTED-ACCEPTANCE.md) and [production checklist](PRODUCTION-CHECKLIST.md). Local improvements do not close the hosted acceptance gate; the production decision remains NO-GO. Phase 12 is not started.
