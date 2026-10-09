# Hostinger Node.js Web Apps (pnpm monorepo)

This repository is **not an Express app**. It contains three separate Next.js services in `apps/`, uses **Node 24** and **pnpm 10.34.5**, and has a validated production launcher. The Hostinger auto-detected settings (`npm install`, build `none`, entry `server.js`) cannot build the application alone.

## First deployment (recommended: staging Business App)

Create a separate **staging subdomain** rather than overwriting an existing production website. Hostinger can import the same GitHub repository separately for each app. Configure:

- GitHub branch: `main`; project directory: repository root.
- Runtime: Node.js **24**. Framework: **Next.js** if selectable, otherwise **Other/Node.js** with the explicit entry below (do not treat app as Express).
- Build command: `npm run hostinger:build`.
- Entry file: `server.js` (repository root); or, if Hostinger exposes a start-command field, `npm run hostinger:start`.
- Output directory: leave unset for server-side Node deployment; the Next.js build remains in `apps/<service>/.next`.
- Environment: `BUSINESS_OS_SERVICE=business-app` (the default), plus the variables below.
- The entry file launches the existing `scripts/start-service.mjs` with host `0.0.0.0` and Hostinger's `PORT` (or 3000 when omitted).
- Hostinger may run its automatic `npm install` before the configured build command. The `hostinger:build` script then performs a frozen pnpm installation for **all** workspace links and builds the selected Next.js app. A successful npm-only install is not a production build for this repository.

For other independent Node.js deployments, set `BUSINESS_OS_SERVICE=platform-admin` or `BUSINESS_OS_SERVICE=websites`, use their own subdomains and build them separately from this same repository.

## Required environment variables

Set environment variables in the **Hostinger secret/settings UI** rather than committing an `.env` file. Set public Supabase values **before building** because Next.js embeds them in browser bundles. Use different staging/production projects and keys. For a staging Business App:

```dotenv
BUSINESS_OS_SERVICE=business-app
APP_ENV=staging
SUPABASE_ENVIRONMENT=staging
APP_ORIGIN=https://YOUR-STAGING-BUSINESS-APP-DOMAIN
LOG_LEVEL=info
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-STAGING-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_REAL_PUBLIC_KEY
AUTH_RECOVERY_SIGNING_KEY=REPLACE_WITH_64_LOWERCASE_HEX_CHARACTERS
QUOTATION_SIGNING_KEY=REPLACE_WITH_64_LOWERCASE_HEX_CHARACTERS
WEBSITE_BUILD_KEY_ID=primary
WEBSITE_BUILD_SIGNING_KEY=REPLACE_WITH_PRIVATE_SIGNING_KEY_AT_LEAST_32_CHARACTERS
BROCHURE_BUILD_KEY_ID=primary
BROCHURE_BUILD_SIGNING_KEY=REPLACE_WITH_PRIVATE_SIGNING_KEY_AT_LEAST_32_CHARACTERS
BROCHURE_PUBLIC_ORIGIN=https://YOUR-STAGING-WEBSITES-DOMAIN
```

Use `APP_ENV=production` and `SUPABASE_ENVIRONMENT=production` together only after production sign-off. Generate **independent** 64-character hex signing keys securely (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), and provision the matching private database keys as described in the existing quotation/website documentation. Do not reuse the Supabase publishable key as a signing key.

Platform Admin also needs `AUTH_RECOVERY_SIGNING_KEY` but not the Business App's quotation/website signing keys. Websites needs the public Supabase configuration, `APP_ORIGIN`, `BROCHURE_PUBLIC_ORIGIN`, and matching environment fields; it must not receive private Business App signing keys. Neither app needs Supabase service-role credentials. Worker credentials belong **only** to the independently hosted worker.

Validate configuration with `node scripts/start-service.mjs business-app --check` after installing workspace dependencies. Then run a read-only hosted smoke test and acceptance checks.

**Release status:** the repository's production checklist currently records **NO-GO**, including unverified hosted Auth, migrations, email, signing, public sites, PDF/Chromium and restricted automation worker. Passing a Hostinger build does not authorize a production cutover. Business App PDF generation needs Playwright Chromium and Linux libraries, which the hosting runtime must support. See `docs/PRODUCTION-ARCHITECTURE.md`, `docs/PRODUCTION-CHECKLIST.md`, and `docs/RELEASE-CHECKLIST.md`.


## Tbot Supabase project: Interior Business OS (2026-10-09)

This repository includes **public, secret-free Hostinger templates** for the dedicated Tbot-connected Supabase project `interior-business-os` (`wqkjzuqiarjyoimrzalk`, Mumbai `ap-south-1`):

| Hostinger service | Safe template | Proposed production origin |
| --- | --- | --- |
| Business App | [`deploy/hostinger/business-app.env.template`](../deploy/hostinger/business-app.env.template) | `https://sghomesinterior.in` |
| Platform Admin | [`deploy/hostinger/platform-admin.env.template`](../deploy/hostinger/platform-admin.env.template) | `https://admin.sghomesinterior.in` |
| Public Websites | [`deploy/hostinger/websites.env.template`](../deploy/hostinger/websites.env.template) | `https://sites.sghomesinterior.in` |
| Automation Worker | [`deploy/hostinger/worker.env.template`](../deploy/hostinger/worker.env.template) | No public origin; **not** a managed website |

**Repository templates cannot inject environment variables into Hostinger on their own.** In hPanel, create a separate Node.js website for each Next.js service. Import the corresponding privately maintained `.env` file into the website's Environment Variables section **before** running `npm run hostinger:build`. Choose Node 24, repository root, and `server.js` entry. The publishable Supabase key and project URL are safe to include in the templates; all signing keys, database passwords, provider tokens and service-role keys must remain private in Hostinger/provider secret stores. Never replace real secrets with `REPLACE_...` template values.

**Private bundle:** If the operator has the previously generated `interior-business-os-tbot-hostinger-env.zip`, use its **Business App private environment file** rather than the public template for the actual Hostinger import. The 2026-10-09 database configuration already has matching private quotation and website/brochure signing keys. Rotating or regenerating those values requires updating the private database records and every consuming app together. Keep this bundle offline and out of Git.

**Schema status checked 2026-10-09:** The dedicated database has 103/103 application migrations with original version numbers, 167 application tables, all 143 public tables protected by RLS, and private signing-key rows. Do **not** apply development demo seeds, disposable-database verification, or reset commands to that project. Its **subscription plans and provisioning defaults are not configured**; hosted Auth, SMTP, role provisioning and tenant acceptance also remain unverified. This is infrastructure preparation, **not a production GO decision**.

**Safest deployment order:** (1) set up an isolated test/staging origin; (2) configure exact Supabase Auth site URL, confirmation/recovery allowlist and SMTP/templates; (3) install private environment values; (4) deploy Business App and verify `/health/live`, `/health/ready`, login, asset responses, RLS, and PDFs; (5) deploy separate Admin and Websites services; (6) complete tenant provisioning, worker supervision and hosted acceptance. Only then point the public production domain at the new application. Do not replace an existing ProPulse deployment during setup.
