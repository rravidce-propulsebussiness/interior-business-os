# Phase B specification — multi-company onboarding, employee access and SG Homes starter

**Status:** implementation specification only. No Phase B features are implemented by this document. **Gate:** Phase A0 production dependency audit and full CI must pass; hosted Phase A1 acceptance requires separately approved staging credentials. Never migrate production or overwrite `sghomesinterior.in` from development.

## 1. Architecture and ownership

Retain `apps/platform-admin`, `apps/business-app`, `apps/websites`; reuse `packages/auth`, `packages/database`, `packages/core`, `packages/website-builder`, and the 103 immutable historical Supabase migrations.

Canonical access tables already exist: `organizations`, `branches`, `profiles`, `organization_memberships`, `roles`, `role_permissions`, `membership_roles`, `platform_roles`, `platform_user_roles`, `platform_role_permissions`, `organization_entitlements`, `modules`, `plans`, `plan_modules`, `audit_logs`. Project assignment and website scope tables already exist. Extend them with additive migrations only after inspecting current constraints, RLS, routines and generated types. **Never create a second company/member/lead/quote/project/accounting database.**

All commands must use Supabase Auth `getUser` and trusted current tenant membership; server actions and PostgreSQL checked RPCs enforce current permissions, entitlement, organization scope, project assignment, suspension, and optimistic version. Browser cookies are only tenant-selection hints, never authority. Platform identity alone never authorizes a tenant read.

## 2. Company registration and activation

Proposed state machine: `draft → submitted → pending_review → active`, with independent `rejected` (reasoned), `suspended` (reversible by authorized platform operator), and `archived` (retention policy required) transitions. Reconcile with existing `organizations.status` values before implementing; do not silently overwrite historic enum/check constraints.

1. Verified user signs up with Supabase Auth; email confirmation is required.
2. Authenticated owner submits legal/business name, company slug, India GST details (optional initially), business email, phone, country, location, industry packs, branding and requested plan.
3. Atomic RPC validates normalized slug uniqueness, authenticated submitter, rate limits and ownership, and creates a *pending* organization plus sole active unbranched Owner membership/role where permitted. A failure rolls back all tables.
4. Platform operator sees pending requests and can approve/reject with reason; an active tenant must have exactly one or more valid Owners as guaranteed by existing invariants.
5. Activation creates the minimum tenant configuration using existing plan/entitlement mechanisms, without granting access to disabled modules or provisioning a published website.
6. Events create status history and append an allowlisted, tenant-scoped audit record; authorized user sees status and can resubmit corrections without a second organization.
7. Email adapter sends verified opt-in status notifications. No claims of delivery until actual configured provider tests pass.

**Anti-abuse:** authenticated email, input normalization, rate limits, exact company identity checks as required, idempotency key, unique slug, no privilege self-assignment, and safe user-facing errors. Verify new-user, duplicate, retry, suspended, rejected, conflicting slug, and email-not-verified cases.

## 3. Platform administrator screens

Existing `/dashboard` and `/dashboard/organizations/[id]` remain canonical. Add, based on verified permission checks:

- `/dashboard/organizations`: paginated search, status/industry/plan filters, pending review queue, limited aggregate counts.
- `/dashboard/organizations/[id]`: legal profile, plan/entitlement, activation history, non-sensitive usage, suspension controls and audit trail.
- `/dashboard/roles`: explicit platform roles and staff assignment, requiring `platform.roles.manage`; no implicit tenant elevation.
- `/dashboard/plans`: plan feature/capacity configuration using existing module architecture, with audit/limits.
- `/dashboard/support`: case records plus separately approved, time-bounded and audited support access. No permanent bypass-RLS platform capability.

Platform role templates: `platform_super_admin`, `platform_admin`, `platform_support` (existing); propose `platform_finance_operator` for SaaS invoices with *no* tenant invoice/CRM visibility. Do not create it until permissions and segregation of duties are validated.

## 4. Company settings and employee invitations

Add `/dashboard/company`, `/dashboard/company/team`, `/dashboard/company/invitations`, `/dashboard/company/roles`, `/dashboard/company/branches`, `/dashboard/company/assignments`. Use current tenant in navigation and preserve deep links.

Invitation state machine: `pending → accepted` or `revoked/expired`. Invite by normalized email, organization, proposed role IDs and branch/project scopes. Store one-way invitation token digest (not plaintext), short expiry, created-by, max attempts and an idempotency key; do not expose invite plaintext in audit/logs. Sending may be retried, never self-approved. Accept only after verified login with matching email; perform role assignment and membership activation in one checked transaction. Reject cross-company acceptances, replay, suspended company/actor, inactive branch and an invite granting more privilege than inviter possesses. Keep existing Owner-invariant and anti-escalation controls.

Team manager features: search/filter members, suspend/reactivate, remove (except last Owner), grant/revoke existing templates, clone/create custom roles, view audit history, and explicit reassignment of projects when a worker leaves. Multiple roles union their scoped *allow* grants; no wildcard role-name bypass.

## 5. Permissions and scopes

Continue permission registry + checked RPC + forced RLS. Scope dimensions:
`organization`, `branch`, `department` (new if needed), `assigned_project`, `assigned_task`, and `owned_customer_record`. A branch-limited grant cannot read organization-wide finance; a project grant cannot read a different project. Resource identity and scope enforcement must use checked SQL joins, not untrusted JWT claims. Do not allow managers to grant any permission or scope they cannot delegate.

Proposed templates below describe least-privilege UI/API capabilities; exact keys must be reconciled with existing permission catalog and entitlement requirements before migration:

| Role | Allow | Explicit exclusion |
| --- | --- | --- |
| Company Owner | Organization, teams, plan-eligible modules and delegated approvals | Platform administration |
| Company Admin | Authorized team/settings and company operations | Owner reassignment; platform roles |
| Branch Manager | Branch staff, leads, projects | Other branches; company-wide confidential finance |
| Marketing Manager | Lead-source/campaign controls, published website marketing | Internal costs, payments, procurement |
| Marketing Executive | Assigned campaign leads and follow-ups | Role management, finance |
| Sales Executive | Assigned leads, customers and customer quotations | Cost/margin, invoice approval by default |
| Customer Support | Customer tickets and assigned follow-ups | Quotes/rates beyond explicitly granted scope |
| Interior Designer / Architect | Assigned drawings/specifications/projects | Company invoices, margins |
| Quotation Estimator | Estimates, drafts; approved rate/catalog access | Company-wide accounting; approval above limit |
| Project Manager | Assigned work, approved changes, material requirements | Unrelated projects; owner role |
| Site Engineer | Assigned drawings, site tasks, measurement and quality | Sales pipeline, customer invoice details |
| Site Supervisor | Daily tasks, assigned crew, progress and material requests | Selling rates, company-wide CRM |
| Purchase Manager | Requests, RFQs, procurement approvals as delegated | Payroll, non-purchasing finance |
| Accountant | Authorized invoices, receipts, balances, reports | Unrelated employee HR records |
| Storekeeper | Stock receipts/issues and material movement | Supplier margins and general accounting |
| Carpenter / Electrician / Plumber / Painter | Today's own assigned tasks, progress/photo and requests | CRM, rates, other workers' private records |
| Watchman / Site Security | Assigned-site check-in/out, visitor and material gate pass | CRM, quotations, payroll and costs |
| Contractor / Subcontractor | Contracted project work and scope-limited reports | Other contracts, employee lists |
| Website Developer | Assigned website draft/edit/publish where granted | CRM/private finance via website role |
| Client | Own customer approvals and viewable project documents | Other customers, company records |

Use existing permission keys when equivalent. Where no suitable capability exists, propose new precise keys such as `workforce.attendance.record`, `site.visitor.record`, `project.tasks.update_assigned`, `crm.leads.view_assigned` and `company.invitation.manage`, with resource-level predicates. **This phase specifies roles only; it does not implement attendance or workforce workflows.**

## 6. SG Homes Interior setup

Create a **non-production staging fixture** only after operator approval and separate development/staging tenant configuration. Suggested display name: `SG Homes Interior`. Existing website `https://sghomesinterior.in/` stays untouched. Do not claim DNS ownership or verified TLS for this hostname.

SG Homes owner can configure business logo, own industry modules, salesperson accounts, marketing/support staff, estimators, project managers, site engineers, supervisors, artisans and watchmen through the above permissions. The existing website builder can start with the `industry-interior` sample; clearly label all concept/project content as illustrative. On approved staging, test website enquiry → canonical CRM lead → assigned salesperson → quotation draft → approval → project handoff without creating fake production customers.

## 7. Website templates and domains

Reuse existing structured document renderer, safe compiler, versioned immutable builds, current public CRM form projection and website-domain attestation. Offer template selection, branding, responsive editor, drafts, version restore and publish in the Business App. Do not execute arbitrary tenant server code. Website ownership + website-scoped publish permission + entitlement are all required.

Domain flows: `*.configured-platform-host` and path tenancy only where current routing supports it; verified custom domains require DNS TXT challenge and hosted TLS validation. Reuse `website_domains` and `website_platform_settings`. Never mark SSL ready based on a client action or deploy a custom hostname until its provider certificate is verified. Avoid auth cookies on custom website domains.

## 8. Database rollout (additive, ordered)

1. Migration inventory and `db:types:check`; record protected-file hashes.
2. Add company-onboarding request/state history and idempotent approval RPCs if existing organization operations are insufficient.
3. Add invite lifecycle and token digest table, restricted policies, one-time acceptance RPC and audit metadata.
4. Expand permission catalog/templates/scope mapping in separate migrations; only add department/task dimensions with schema + RLS proofs.
5. Add tenant/branch/project-specific invitation and staff listing projections with pagination.
6. Add platform case/approval projections with explicit platform-only permissions and auditable access.
7. Add marketing/support templates and website starter fixture in development/staging seeds only.
8. Regenerate types; test migrations on new disposable PostgreSQL and a separately reviewed staging database.

Never edit prior migrations, bypass RLS, add browser service-role credentials, or copy production records into test fixtures.

## 9. Acceptance matrix and release gates

- Account lifecycle: signup, verified email, duplicate/race/retry, owner preservation, pending/rejected/active/suspended/archive policies.
- Invitation lifecycle: correct recipient acceptance, expiry, replay/revocation, stale membership/roles, escalation denial, different-company denial.
- Scope: two tenants A/B; each role's permitted + denied paths; branches and assigned projects; record/PDF/media IDOR denial; revocation mid-session.
- Customer/business regression: existing CRM, quotation, payment, invoice, project, procurement, web form, brochure and publication snapshots unchanged.
- Website: all three apps independently boot; preview, publish, rollback, domain TXT/TLS and disabled entitlement; SG Homes demo never reaches production.
- Security: forced RLS, checked RPCs, safe log/audit fields, short-lived tokens, no elevated cross-tenant platform read.
- CI: frozen install, full unsuppressed dependency audits with documented dev-only residual, format/lint/types, Vitest, migrations/RLS, builds, Playwright; all required checks green.
- Hosted acceptance: dedicated staging Supabase/Auth/SMTP and DNS/TLS tests are **separately blocked until operator infrastructure exists**. Local passes cannot satisfy hosted gates.

## 10. Delivery order

**B1:** company owner onboarding and platform review, no new tenant data exposure. **B2:** invitations and robust company role editing. **B3:** branch/project/field-role least privilege, with restricted prototype UI. **B4:** website template/domain and SG Homes staging experience. **B5:** full hosted acceptance, documentation, operational handoff. Each increment must be a small PR with migration rollback plan, security test matrix and reproducible evidence.

Marketplace implementation and attendance/workforce automation remain outside Phase B and must not begin until foundation and access controls are accepted.
