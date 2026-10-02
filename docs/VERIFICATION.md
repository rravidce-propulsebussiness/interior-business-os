# Phase 0 verification

Executed locally on Windows with Node 24.19.0 and pnpm 10.34.5 on 2026-09-27. The repository initially contained only .git; no application files or local AGENTS.md instructions were present.

## Commands and results

| Command                                         | Result                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `node --version`, registry version/peer queries | Resolved compatible framework/tool versions                                          |
| `pnpm install`                                  | Installed all 12 workspace projects and generated pnpm-lock.yaml                     |
| `pnpm install --frozen-lockfile --offline`      | Passed using the installed dependency cache                                          |
| `pnpm format` and `pnpm format:check`           | Formatting applied; check passed                                                     |
| `pnpm lint`                                     | Passed with zero warnings after fixing three PostCSS export warnings                 |
| `pnpm typecheck`                                | Passed for all 11 app/package workspaces and root test/tool configuration            |
| `pnpm test`                                     | 12 tests passed across 2 files                                                       |
| `pnpm build`                                    | All 3 Next.js production builds passed                                               |
| `pnpm exec playwright install chromium`         | Browser and required support binaries installed                                      |
| `pnpm test:e2e`                                 | 6 Chromium smoke tests passed against production servers                             |
| `git diff --check`                              | No whitespace errors in tracked diffs; all new source files also checked by Prettier |

Unit coverage verifies anonymous, suspended, cross-tenant, missing permission, missing entitlement, wildcard and branch-scope denials; separate website/brochure access; and environment validation that excludes private fields. Browser coverage verifies each app's root heading, main landmark, keyboard skip link, 375px overflow behavior and 404 response.

## Environment fixes and compatibility notes

- pnpm was not globally installed. Bootstrapped with `npm.cmd exec --yes --package=pnpm@10.34.5 -- pnpm install`; subsequent verification used the cached pnpm executable with its .bin directory added only to the process PATH.
- PowerShell execution policy blocks npm.ps1; used npm.cmd without changing system policy. Initial sandbox registry queries failed; dependency downloads succeeded through approved network access.
- An initial typecheck invocation could not find nested pnpm; fixed the process PATH and reran successfully.
- ESLint 10.11.0 was tried, but current Next.js React/import/accessibility plugins declare incompatible peer ranges. Retained ESLint 9.39.5, which the registry marks unsupported. Upgrade this tooling group together when compatible versions become available.
- Excluded .pnpm-store and .tools from formatting/linting. Stopped the obsolete lint scan and reran after exclusions.
- pnpm blocks the unrs-resolver lifecycle script by default; installed platform binaries were sufficient for the successful lint run. Only esbuild, sharp and Tailwind's native engine are explicitly allowed build scripts.
- Browser startup emitted harmless conflicting color-environment warnings. No test failures resulted.
- The first sandboxed Playwright run passed all tests but stalled stopping Windows server processes. Stopping only its three identified Next.js servers allowed the runner to exit with code 0 and report 6 passed. A second run outside the sandbox passed all 6 tests in 41.2 seconds, automatically cleaned up its servers and exited with code 0.

## Not verified or implemented

No live Supabase project, session integration, tenant schema, RLS policy, Storage policy or privileged adapter exists yet. The baseline SQL migration is intentionally a no-op and was not applied to a database. Policy unit tests are not proof of database isolation. No credentials, external database changes or deployments were made.

CI configuration was created but has not run on GitHub. Tests were run locally in Chromium on Windows, not other browsers/platforms. Automated smoke checks are not a full accessibility or security audit. Development mode was configured; production builds and production servers were the surfaces verified in this phase.

Hosting/region, backup and retention policies, concrete permission catalog, subscription packaging, pricing rounding and formula rules remain future decisions documented in ROADMAP.md. No CRM, billing, quotation screens, project management or website builder was implemented.
