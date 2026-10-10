# Universal Business OS — existing-versus-required audit (2026-10-10)

**Status: first implementation slice in draft, not production ready.** This review uses the GitHub default branch and read-only inspection of the connected `business-os-staging` Supabase project (`qxdulecfulzrtwuomzve`). It is not a hosted end-to-end acceptance report. No production database, DNS, website or deployments were changed.

## 1. Reuse boundaries

The repository contains three separate applications: `apps/platform-admin`, `apps/business-app`, and `apps/websites`; 9 existing reusable packages; and 103 ordered Supabase SQL migrations. Do **not** restart the implementation or fork a domain schema for each industry.

Connected staging currently reports **131 tables in the public schema, all with RLS enabled**. Existing canonical entities include:

- Tenancy: `organizations`, `branches`, `profiles`, `organization_memberships`, `roles`, `role_permissions`, `membership_roles`, `permissions`, `platform_roles`, `platform_user_roles`, `platform_role_permissions`, `audit_logs`.
- Industries and subscriptions: `industries`, `organization_industries`, `plans`, `plan_modules`, `modules`, `organization_entitlements`.
- Business domains: `leads`, `customers`, `quotations`, `quotation_revisions`, `catalog_items`, `projects`, `project_tasks`, `contracts`, `invoices`, `payments`, `purchase_orders`, `inventory_lots`, `websites`, `website_versions`, `website_domains`.

These entities are **existing foundations**, not proof that every intended workflow passes real hosted acceptance. Check `docs/PRODUCTION-GO-NOGO.md` and `docs/PHASE11-VERIFICATION.md` before release.

## 2. Feature gap matrix

| Requested capability                                              | Present now                                                                          | Missing before acceptance                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Unified core CRM, customers, quotations and catalog/pricing       | Canonical migrations, repositories, domain services and UI                           | Hosted tenant tests and workflow refinements                                                                         |
| Billing, contracts, payments, projects, procurement and inventory | Canonical tables, checked RPCs and dashboard modules                                 | End-to-end acceptance and additional business workflows                                                              |
| Platform Super Admin                                              | Platform roles, permission checks, organization status/plan and entitlement actions  | Searchable organization console, approvals, SaaS plan editor, safe support, audit UX                                 |
| Company onboarding                                                | Supabase sign-up, `create_organization` RPC, owner role and optional single industry | Verified-email company application, idempotent approval process, multi-industry selection, guided onboarding         |
| Employee/team management                                          | Memberships, roles, branch-scoped grants and team RPCs                               | Email-based invitations, visual role editor, project/task scopes and mobile worker views                             |
| Industry Packs                                                    | `industries` and `organization_industries`; interior starter package                 | Versioned pack definitions, configurable roles/forms/workflows/catalog/dashboard registry and multiple enabled packs |
| Template website builder                                          | Page-tree editor, responsive preview, published versions, lead forms                 | Further premium templates and hosted operational verification                                                        |
| Fully custom frontend websites                                    | Restricted HTML/CSS/JS iframe components                                             | ZIP/React/TypeScript build pipeline, isolated asset hosting and complete website imports                             |
| Hosted URLs and custom domains                                    | Website/domain tables and resolver infrastructure                                    | Verified customer-facing DNS/TLS provisioning, automated lifecycle and hosted tests                                  |
| Shared materials marketplace                                      | Vendors, materials and purchasing within company domain                              | Cross-tenant seller catalog, merchant onboarding, cart/order/dispute and settlement domain                           |
| Analytics and automations                                         | Reporting and notification/outbox implementation                                     | New industry-specific widgets and hosted job acceptance                                                              |

**Do not rename the canonical business application or redirect `sghomesinterior.in` as part of these changes.** A website-builder capability does not imply that arbitrary user code can run on the authenticated dashboard origin.

## 3. Immediate release gates (Phase A0)

The default branch's known dependency/PDF work is still separated into draft branches:

- PR #7 `fix/phase-a0-dependency-security-20261010`: Next.js, Sharp, source-map-js and lockfile updates.
- PR #9 `fix/phase-a0-rich-pdf-providers-20261010`: rich PDF provider architecture stacked on PR #7.
- PR #10 `style/phase-a0-staging-auth-format-20261010`: formatting of concurrent staging-auth work.

Their work must be reconciled and passing before production merge/deployment. Avoid overwriting the staging Auth additions or weakening existing PDF security and fidelity assertions. PR #9's own notes report strong isolated CI results but also **unverified hosted Cloudflare PDF credentials**, so its hosted gate is not closed.

Supabase security advisors currently flag **8 anonymous-executable** and **132 authenticated-executable** `SECURITY DEFINER` function cases plus disabled leaked-password protection (warning). These are **review findings**, not 140 established exploits. Classify every callable function by intended caller and effective in-function authorization; never blanket revoke RPC permissions needed by public forms, brochures or authenticated business operations. See the Supabase linter guidance for [anonymous functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## 4. First Phase 1 code slice (this branch)

Implemented without changing tenancy data or SQL migrations:

1. Add `createRepository().organizationDirectory`: RLS-backed, bounded server-side company-name search, approved status filtering, stable sort, exact count and pagination.
2. Add `apps/platform-admin/src/app/dashboard/organizations/page.tsx`: permission-gated responsive organization directory with status filter, search, paging and links to the canonical company detail view.
3. Add navigation from the existing platform dashboard.

**Remaining:** company review queue and transitions, verified company identity, registration approval, tenant owner/team onboarding, configurable plan/industry management, new migrations/RLS and hosted acceptance. Do not label Phase 1 complete because the directory exists.

## 5. Ordered delivery plan and validation

1. **Close A0**: reconcile the three open draft branches; frozen installs, full CI, protected PDFs, real Worker and hosted Supabase readiness; preserve production.
2. **Phase 1**: extend canonical onboarding through additive, rollback-planned tables for applications/status history (do not overwrite the existing `organizations.status` check); verified email, approval rights, idempotency and audit; Platform Admin review queue and accessible company wizard; tests for rejected/suspended/cross-company requests.
3. **Phase 2**: extend existing `roles`, `membership_roles`, project assignment and permission registry rather than introducing another auth system; safe invitation emails with hashed token/expiry, scoped role designer, worker dashboards and anti-escalation tests.
4. **Phase 3**: implement versioned Industry Pack registry linked to existing `industries` and `organization_industries`; use configuration/templates and one quote/pricing/project engine. Start with Construction, Interior and the combined configuration.
5. **Phase 4**: preserve current website builder; add isolated, resource-limited custom frontend project validation/build/publish service. Never execute arbitrary tenant code with Business App cookies or service keys.
6. **Phase 5**: hosted slug/subdomain/custom-domain registration, TXT/CNAME verification, TLS provisioning, tenant-safe routing and stable migration between URL types. No changes to SG Homes live routing without verified cutover.
7. **Phase 6**: refine canonical lead → customer → quotation → contract → project → tasks → procurement → invoice → payment → handover processes with versioned optional stages and approvals.
8. **Phase 7**: build a distinct _marketplace bounded context_ that **reuses** catalog classification and procurement contracts but correctly separates merchants, external buyers, orders, disputes and financial settlements.
9. **Phase 8**: run real staging Auth/RLS/Worker tests, cross-company probes, permission denial matrix, browser/mobile tests, migration dry runs, rollback, monitoring and hosted DNS/TLS/PDF acceptance.

Do not create demo customers, claims of completed projects, employees or marketplace sellers on production from unverified sample data. Seed example workers/companies only in explicitly isolated staging fixtures.

## 6. Acceptance scenarios

All three scenarios must pass in a disposable environment and then in approved staging, with deny-path assertions:

- **SG Homes Interior**: verified owner → approved organization → Interior pack → isolated custom website → Designer and Carpenter invitations → shared CRM lead/quote → assigned project/task management.
- **Construction company**: approved Construction pack → template website → Site Engineer and Watchman access (no financial access for Watchman) → site logs → procurement and receipts.
- **Future industry**: register and activate new versioned Industry Pack → existing organizations may opt in → shared CRM/quotations/billing/projects/websites work without copied implementation or tenant tables.

## 7. Evidence and limitations

- Read-only GitHub tree inspection: 891 tracked tree entries, 103 SQL migration files, 3 app packages.
- Connected staging schema inspection: 131 public tables, 131 RLS-enabled.
- Confirmed `public.create_organization` currently accepts one `industryId` and creates an owner membership immediately; approval workflow must be added without silently breaking existing tenants.
- Confirmed `/register` currently creates only an Auth identity; it does not onboard a new organization.
- Existing `/dashboard/organizations/[id]` already manages plans/status and entitlements under explicit platform permission checks.
- No live customer login, production browser smoke, Cloudflare PDF call, hosted migration, performance benchmark, TypeScript compile or Playwright execution was performed in this audit. This branch remains draft until verification.
