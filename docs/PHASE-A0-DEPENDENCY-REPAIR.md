# Phase A0 — dependency security repair and verification ledger

Date: **2026-10-10**. Target base: `main` at `7cabc24453e4f239c8dc6c2bf9163781d85ef843`.
Branch: `fix/phase-a0-dependency-security-20261010`.

**Scope:** small dependency-only repair; no production deployment, database migrations, data mutations or business-feature rewrites. Phase A0 is **not closed** until the required `Foundation checks` workflow passes on the final PR head. Hosted acceptance must be separately recorded as blocked or verified.

## Root cause and dependency changes

The 2026-10-09 `Foundation checks` run [37983731824](https://github.com/rravidce-propulsebussiness/interior-business-os/actions/runs/37983731824) failed at `pnpm audit --prod --audit-level=high`, preventing downstream checks from executing.

- Upgrade `next` across Business App, Platform Admin, Websites and internal Auth/Database peer/development manifests: **16.3.6 → 16.3.8**. Keep root `eslint-config-next` synchronized **16.3.6 → 16.3.8**. Resolves [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) (image optimization SSRF) and related 16.3.8 security fixes.
- Upgrade all direct `sharp` copies in Business App, Websites and `packages/shared`: **0.35.4 → 0.35.5**. Resolves [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) (librsvg).
- Add a pnpm workspace **version-resolution override**, `source-map-js: 1.2.2`, for the transitive dependency reported by the production audit. This selects the real published patched version for [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), **not** an audit exemption or ignore.
- Regenerate `pnpm-lock.yaml` using the pinned **pnpm 10.34.5** running under **Node 24**, then verify a frozen installation.
- Keep the existing reviewed `braces@3.0.3` local patch and `pnpm security:dependency` regression test. The upstream [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) remains unresolved with no upstream fixed version. It concerns development-only lint tooling; `docs/DEPENDENCY-MITIGATION.md` covers limitations and accountable residual risk. It must not be reported as upstream fixed or suppressed.

## Files intended in the final PR

`package.json`, `apps/business-app/package.json`, `apps/platform-admin/package.json`, `apps/websites/package.json`, `packages/auth/package.json`, `packages/database/package.json`, `packages/shared/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` and this documentation. `docs/PHASE-B-COMPANY-ACCESS-SPEC.md` documents _future scope only_. The one-time dependency lockfile regeneration workflow ran on the branch and was then deleted, so it is not part of the final feature diff.

## Verification evidence (executed versus pending)

A one-time GitHub Actions job [38024541193](https://github.com/rravidce-propulsebussiness/interior-business-os/actions/runs/38024541193) completed **SUCCESS** on 2026-10-10 with these actual steps:

| Actual command                                  | Result | Evidence                                          |
| ----------------------------------------------- | ------ | ------------------------------------------------- |
| `pnpm install --lockfile-only --ignore-scripts` | PASS   | Generated new lockfile                            |
| `pnpm install --frozen-lockfile`                | PASS   | Resolved and installed dependencies               |
| `pnpm audit --prod --audit-level=high`          | PASS   | Runner output: `No known vulnerabilities found`   |
| `pnpm security:dependency`                      | PASS   | Patched braces regression tests                   |
| Lockfile-only commit                            | PASS   | Commit `ef690a93224639024351b3eae52a660f4819f22a` |

The project's independent CI workflow `.github/workflows/ci.yml` executes: email adapter and acceptance tests, dependency mitigation regression, unsuppressed production audit, fresh disposable PostgreSQL migrations with RLS assertions and generated type/seed checks, Playwright Chromium install, recovery regression, formatting, linting, TypeScript, full Vitest, three Next.js application builds, client and secrets scanning, and browser E2E. **The final PR/head run is authoritative; historical successes do not count as current pass.**

Do **not** use `db:verify` with a hosted/staging/production database. It resets a disposable local PostgreSQL database by design.

## Hosted and production checks — separate blockers

- **Blocked pending safe configured targets:** `pnpm production:smoke` requires `PLATFORM_ADMIN_ORIGIN`, `BUSINESS_APP_ORIGIN`, `WEBSITES_ORIGIN` and working hosted readiness endpoints. Authenticated smoke additionally needs a controlled staging test identity; do not use production customers.
- **Blocked unless provisioned:** hosted Supabase registration/real email/recovery, cross-tenant Auth/RLS, private media, DNS/TLS, worker/SMTP, isolation restore, monitoring, rollback, production load measurements and release-owner signatures.
- A production `Workers Builds` check being green does not prove three Next.js services, real login, any SQL migration, domain routing or provider acceptance. No real credentials, provider tests, or production deployment have been asserted.

Production remains **NO-GO** under `docs/PRODUCTION-GO-NOGO.md` until its independent acceptance gates close.

## Rollback

Revert this feature branch's dependency and lockfile commits as a unit after checking the original lockfile; never delete historical migrations. Keep `main` and all hosting bindings untouched. If package compatibility fails, investigate and update the feature branch only, then rerun all mandatory tests.

## Follow-on work

After final CI is green and an independent hosted-staging plan is approved, begin company onboarding and verified invitations using `docs/PHASE-B-COMPANY-ACCESS-SPEC.md`. Do not start marketplace or workforce modules during Phase A0.
