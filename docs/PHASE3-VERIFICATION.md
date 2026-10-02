# Phase 3 implementation and verification

Phase 3 adds the first commercial quotation workflow and preserves the Phase 1/2 migrations and canonical catalog pricing engine. Hosted acceptance remains pending; no Supabase credentials were supplied. This report records local evidence, not a deployment claim.

## Architecture and scope

1. **Workflow:** customers → commercial projects → areas → quotation draft → catalog/manual lines → issue → clone → explicit refresh → subsequent issue. CRM pipeline, execution, BOQ, invoices, payments and builders are excluded.
2. **Public tables:** `customers`, `customer_contacts`, `projects`, `project_areas`, `organization_quotation_settings`, `quotations`, `quotation_revisions`, `quotation_items`, `quotation_item_costs`.
3. **Migrations:** five additive files `20260930000000_quotation_schema.sql` through `20260930000400_quotation_staff_access.sql`. Private tables hold number counters, signing keys and short-lived replay receipts. Types were generated from PostgreSQL.
4. **Customers/projects:** typed addresses, individual/business customers, optional contacts, tenant-bound customer/project/area relationships, branches, optional industry and assignment references, active/inactive masters and ordered/nested areas. No execution tasks.
5. **Quotation aggregate:** stable root number and customer/project identity; independently numbered content revisions; stable line lineage across cloning; detached snapshot schema version 1.
6. **Numbering:** organization/year counters increment transactionally under the organization lock. Unique constraints independently protect quotation and revision numbers.
7. **Lifecycle:** draft → issued/cancelled; issued → superseded/cancelled. A new issue supersedes the prior issue. One draft and one issued revision per root. Cancelled roots/revisions cannot be edited or reissued. Content cannot be changed after issue.
8. **Snapshots:** persisted item labels, questions/selected options, customer-visible specifications, dimensions, unit/book/rate/modifier and rounding data, area labels, discounts and original/final amounts. Branding, customer/project addresses and terms are revision snapshots. Cost is a separate row. Rendering never reprices a historical revision.
9. **Discounts:** canonical line calculation → optional authorized override → line discount → included-line sum → revision discount. Exact Decimal/numeric arithmetic; no implicit currency conversion or tax. Discount permissions are checked again in the database.
10. **Optional items:** excluded from payable totals and estimated contribution; shown separately. Arrangement changes and duplication preserve pricing snapshots.
11. **Overrides:** manual lines and catalog rate overrides require `quotation.override_rate` and a reason. Catalog overrides retain the original canonical result.
12. **Minimum rates:** line discounts/overrides cannot go below the configured minimum amount. Revision discounts are checked proportionally without floating-point division.
13. **Cost security:** RLS protects separate cost rows. Server pricing context is HMAC-attested and item-scoped. Unauthorized client payloads receive no internal costs. Estimated Contribution is unavailable when an included cost is missing, rather than treating it as zero.
14. **PDF:** one allowlisted, escaped customer document renderer feeds HTML preview and Playwright Chromium PDF. Node runtime, A4, repeated table headers, room groups, optional markers, page numbers, network blocking, bounded logo data URIs and private/no-store downloads.
15. **RLS:** all nine public tables enable and force RLS; authenticated users have SELECT only. Mutations use checked RPCs. Composite foreign keys prevent cross-tenant parents. Frozen-content triggers provide an additional database boundary.
16. **Permissions:** new `customer.view/create/manage` and `quotation.issue`; existing quotation, project and settings permissions remain separate. Customer access accepts CRM or Quotation entitlement; projects require Projects; catalog quotation lines also require Catalog/Pricing. Website is unrelated.
17. **Audit:** master mutations and quote actions write audit records transactionally. Quote records include action, actor, tenant, quotation/revision/line identifiers; snapshots retain override/manual reasons. No internal-cost payload is copied into audit metadata.
18. **Routes:** `/dashboard/customers`, `/dashboard/projects`, `/dashboard/quotations`, their detail routes, `/dashboard/quotations/settings`, and protected revision `/preview` and `/pdf`. Catalog selectors and lists search/page on the server. Shared dynamic questions reuse Phase 2 controls.

## Verification evidence

19. **Unit/integration:** 99 tests across 12 files passed with `TEST_DATABASE_URL` configured. This includes the original suites, exact quote arithmetic, customer DTO safety, attestation, PostgreSQL lifecycle and historical Wardrobe prices, and independent-session concurrency.
20. **Database:** fresh database `phase3_verify3` applied every migration and repeated seeds. Repeated security verification passed **175 assertions**: 80 Phase 1 + 57 Phase 2 + 38 Phase 3, including catalog category filtering. Generated type drift and Interior seed drift checks passed. No earlier tests were removed or weakened.
21. **Playwright:** final full run passed **14 tests**, skipped **22** (5 require absent live credentials; 17 are inapplicable to their app project), with no failures. This includes the production-renderer PDF test with a long specification and historical exports; that test also passed separately.
22. **Builds:** all three production builds passed in the final `pnpm check` run. Frozen installation, formatting, lint, strict typechecking and the browser bundle secret scan passed. The full check command exited 0.
23. **Hosted acceptance:** not run. Required: development Supabase URL/publishable key, confirmed Owner credentials, migrated/seeded development organization, matching server/database quotation signing keys and installed Chromium. Enable `E2E_LIVE_QUOTATIONS=true` to run the new live scenario. Local PostgreSQL does not emulate hosted Auth/PostgREST.
24. **Limits:** 200 lines/revision, 250 areas in the area selector, 100 contacts in the customer detail view. Organization-level workflows fail closed for branch-only role assignments. Manual cost entry is supported by the domain/transport but not offered in the current manual-line form. PDF concurrency is bounded per process; deployment needs an ingress limit and Chromium OS dependencies. Authenticated visual/browser acceptance remains pending live configuration.
25. **Next phase:** first complete live Phase 3 acceptance. Then obtain an explicit scope for CRM pipeline or approved-quotation handoff. Do not infer authorization for billing, purchasing, execution BOQ, customer approval links or builders from this phase.

## Files and commands

Created commercial schemas/document rendering in `packages/core/src`; quotation arithmetic/snapshot helpers in `packages/quotation-engine/src`; attestation and repository adapters, migrations, seed and tests in `packages/database`; commercial routes/forms in `apps/business-app`; and quotation browser tests under `tests/e2e`. Updated the dependency lockfile, server-only environment example, client bundle scanner, navigation and architecture/setup documentation. Platform Admin and Websites business features were not expanded.

Commands run include `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm security:client`, `pnpm test:e2e`, `pnpm check`, `db:verify`, `db:test`, `db:types:check`, and `db:seed:check`, with targeted Vitest runs while fixing issues. Logs are in ignored `.tools/phase3-*.log`; browser PDF artifacts are in ignored `test-results`.

The first PowerShell download attempt for PDF tooling timed out; a curl retry succeeded. The first browser runner needed explicit cleanup of its three workspace Next.js processes. The final runner used the necessary Windows process permissions and completed cleanup without manual intervention. No unrelated process or user data was removed.

## PDF visual evidence

The production renderer generated a seven-page A4 sample with 24 lines, two room groups, a long specification, optional work, totals, terms and page-number footers. Poppler rendered the actual PDF pages to PNGs for visual review; text extraction confirmed the complete long specification, final line and exact totals, with no internal field markers. Separate two-page Rev 1 and Rev 2 PDFs retained 133280 and 138880 respectively. These are renderer fixtures; PostgreSQL integration separately verifies those historical Wardrobe values across real saved revisions and catalog changes. Hosted authenticated PDF acceptance remains pending.
