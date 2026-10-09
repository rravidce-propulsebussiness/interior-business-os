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
