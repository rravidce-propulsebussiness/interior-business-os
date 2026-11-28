# Business OS repository audit — 28 November 2026

Base commit: `8863d5037612b52d39228231e33738f2db4774e9`.

## Repaired behavior

- Dashboard layout redirects unauthenticated sessions to sign-in and preserves provider/tenant errors. Authenticated users without a company can still reach onboarding.
- WhatsApp inbox/contact refreshes cancel obsolete foreground requests, ignore stale responses, and avoid overlapping background polls. A company change remounts the WhatsApp workspace to clear the previous company’s selected connection, messages and other client state.
- Quotation search results remain accessible when the optional sharing lookup fails. Unknown sharing state is not reported as a confirmed empty Shared list; existing unavailable-state labels and warning remain.
- CRM history retains the owner-authorized reset exception. Retention deletion is restricted to the exact expired lead, trusted purge execution and its history; active and recoverable leads remain protected. Purge workers lock candidates, skip concurrent locks and restore their scoped flag.
- The missing measurement-status migration from open PR #569 is included unchanged, using the filename already recorded in production. Fresh installations can enter both area collection states.
- Generated database types include the lead recycle-bin `archived_at` column introduced by the retention migration.
- Meta confirmations and corrections are recorded in CRM history again. Confirmation-only forms stop after confirmation, and area-method replies tolerate surrounding whitespace. SQL regression coverage follows confirmation → area method → area value → quotation and verifies idempotency.
- Dashboard overview requests use the intended static logging category.
- Regular test discovery now includes all shared WhatsApp/automation helpers, auth provider, ingress and additional quotation regressions. The hostname test now distinguishes valid external-host syntax from actual ownership, which is enforced by HMAC and exact database lookup.

## Validation

- Regular Vitest suite: 1,142 passed, 14 integration tests skipped without `TEST_DATABASE_URL`.
- Deployment/CRM/email/dependency Node checks: 38 passed.
- All 327 migrations applied and the canonical database verification script completed through 386 SQL-file executions (including repeatable seeds) in an isolated PGlite PostgreSQL engine. No production data was used or changed. This is not native PostgreSQL CI or a concurrent multi-session race run.
- Production builds cover Business App, Platform Admin and Websites. Business App was rebuilt after the final layout change.
- Formatter, ESLint and workspace type checks passed. Browser bundles and source/artifact secret scans passed (117 JavaScript files and 6,389 source/artifact text files). Acceptance harness tests: 30 passed.

## Remaining audit findings

A diagnostic run temporarily enabled every `apps/business-app/src/**/*.test.ts(x)` file. It found 76 failing assertions across 24 files before repairs. Most failures assert exact source formatting or retired page structure; one suite opens a removed component at module load. These findings were not converted into product changes merely to satisfy obsolete snapshots. The regular test command remains green and now discovers additional behavior suites automatically. The broader source-test inventory still needs modernization before replacing its remaining explicit page-suite list with a universal glob.

Initial failing files (some behavior assertions were corrected in this repair):

- `apps/business-app/src/public-website-hosts.test.ts`
- `apps/business-app/src/request-log.test.ts`
- `apps/business-app/src/app/client/client-auth.test.ts`
- `apps/business-app/src/app/dashboard/glass-theme.test.ts`
- `apps/business-app/src/app/dashboard/billing/save-issued-invoice.test.ts`
- `apps/business-app/src/app/dashboard/employees/employees.test.ts`
- `apps/business-app/src/app/dashboard/finance/billing-amount-policy.test.ts`
- `apps/business-app/src/app/dashboard/finance/customer-payments-panel.test.ts`
- `apps/business-app/src/app/dashboard/finance/payment-proof-flow.test.ts`
- `apps/business-app/src/app/dashboard/projects/auto-certified-stage-payment.test.ts`
- `apps/business-app/src/app/dashboard/projects/onsite-qc-review.test.ts`
- `apps/business-app/src/app/dashboard/projects/project-item-schedule.test.ts`
- `apps/business-app/src/app/dashboard/projects/project-stage-unified.test.ts`
- `apps/business-app/src/app/dashboard/projects/project-v2-regression.test.ts`
- `apps/business-app/src/app/dashboard/projects/projects-reset.test.ts`
- `apps/business-app/src/app/dashboard/projects/work-progress.test.ts`
- `apps/business-app/src/app/dashboard/settings/test-data-reset.test.ts`
- `apps/business-app/src/app/dashboard/quotations/quotations-list-recovery.test.ts`
- `apps/business-app/src/app/dashboard/website/design-theme.test.ts`
- `apps/business-app/src/app/dashboard/website/visual-canvas-upload.test.ts`
- `apps/business-app/src/app/dashboard/website/wordpress-flow.test.ts`
- `apps/business-app/src/app/dashboard/company/team/team-access-ui.test.ts`
- `apps/business-app/src/app/dashboard/crm/settings/requirement-fields.test.ts`
- `apps/business-app/src/app/dashboard/customers/[id]/customer-profile.test.ts`

## Release boundaries

This audit prepares repository changes; it does not deploy them or apply the new cleanup/history migrations to production. The Meta app’s publication/App Review restriction remains external to these code fixes. A live Meta lead → Business OS → WhatsApp quotation test still needs fresh provider events and recipient replies after the relevant provider restrictions are cleared.
