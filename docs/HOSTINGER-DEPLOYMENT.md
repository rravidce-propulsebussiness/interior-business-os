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

## Avoid Server Action 404 after redeployment

Next.js Server Actions use build-specific identifiers. When Hostinger serves
an old form/bundle against a different Next.js build, it can return
`UnrecognizedActionError: Server Action ... was not found` (HTTP 404).
This is **not** fixed by giving the browser an elevated Supabase key.

The `hostinger:build` command now creates a unique, non-secret
`NEXT_DEPLOYMENT_ID` **for each build** and embeds it into the Business App.
Next.js uses it to identify deployment skew and force a full navigation
rather than using incompatible cached Server Actions. The native launcher
reads the ID from the published Next.js build and restores it at runtime.

For reliable deployments:

1. **One build, one published artifact, one restart.** Use branch `main`,
   repository root, Node 24, build command `npm run hostinger:build`,
   entry `server.js`, and `BUSINESS_OS_SERVICE=business-app`.
   Never build over the directory of a running Node service.
2. Hostinger's npm `postinstall` fallback may build the app automatically.
   **If your Hostinger project reliably runs the explicit build command,**
   set `BUSINESS_OS_SKIP_AUTOBUILD=1` to prevent building twice. Do not
   set it if the explicit build command is missing or ignored.
3. Recommended for self-hosting: create an independent random **32-byte
   base64** encryption key with a trusted local terminal:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Put the result **only in Hostinger's private environment settings** as
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. It must be identical at
   **build and runtime**, and across all instances of this Business App.
   Never use `NEXT_PUBLIC_`, log it, or commit it. Generate it once;
   do not rotate casually during a rolling release. A consistent encryption
   key complements deployment IDs but **does not make old action IDs
   valid forever**. The build warns if the key is absent and refuses malformed
   keys.

4. Leave `NEXT_DEPLOYMENT_ID` **unset** in Hostinger unless the release
   automation supplies a **new non-secret value for each deploy**. Reusing
   a fixed ID would disable change detection.
5. Publish the completed artifact, restart Node, open a fresh/private browser
   session and revisit `/admin/organizations/create`. The page is
   dynamically rendered, but old tabs still keep old JavaScript and forms.
6. If a brand-new private window still receives an Action 404, compare
   Hostinger build logs (`Next deployment ID`), server startup logs
   (`Running deployment`), deployed `.next/BUILD_ID`, and any CDN/edge
   caching for HTML or RSC requests. Static `/_next/static` assets can
   be cached by version; authenticated HTML, RSC responses and POST Server
   Actions must not be cached across releases. Roll back/redeploy the entire
   matching build if those versions disagree. Do not keep retrying a form
   whose previous request might have completed.

Owner provisioning is a **separate configuration concern**. Only the
Business App backend needs `SUPABASE_SECRET_KEY` (or the legacy
`SUPABASE_SERVICE_ROLE_KEY`) for creating a _new_ owner identity. It must
be a server-only credential matching the same Supabase project used by the
Business App's public URL and publishable key.

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

Platform Admin also needs `AUTH_RECOVERY_SIGNING_KEY` but not the Business App's quotation/website signing keys. Websites needs the public Supabase configuration, `APP_ORIGIN`, `BROCHURE_PUBLIC_ORIGIN`, and matching environment fields; it must not receive private Business App signing keys. The Business App is the exception when provisioning new owner identities: it needs a narrowly hosted, **server-only** `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`). Platform Admin and Websites do not need that credential. Worker credentials belong **only** to the independently hosted worker.

Validate configuration with `node scripts/start-service.mjs business-app --check` after installing workspace dependencies. Then run a read-only hosted smoke test and acceptance checks.

**Release status:** the repository's production checklist currently records **NO-GO**, including unverified hosted Auth, migrations, email, signing, public sites, PDF/Chromium and restricted automation worker. Passing a Hostinger build does not authorize a production cutover. Business App PDF generation needs Playwright Chromium and Linux libraries, which the hosting runtime must support. See `docs/PRODUCTION-ARCHITECTURE.md`, `docs/PRODUCTION-CHECKLIST.md`, and `docs/RELEASE-CHECKLIST.md`.

## Single-website Business App and Super Admin deployment

**The production website uses ONE Hostinger Node.js deployment** at `https://sghomesinterior.in`. Do not deploy `BUSINESS_OS_SERVICE=platform-admin` to the existing domain. The Super Admin routes are integrated into the Business App and share the same origin, deployment, Supabase project, and existing login session:

- `https://sghomesinterior.in/`: Business OS public landing page
- `https://sghomesinterior.in/admin`: the single platform dashboard for authorized platform administrators; its first sidebar entry is **Dashboard**
- `https://sghomesinterior.in/dashboard`: tenant/company workspace for ordinary organization members; users with all platform-dashboard permissions are automatically redirected to `/admin`
- `https://sghomesinterior.in/admin/organizations`: all tenant companies, plans and entitlements
- `https://sghomesinterior.in/admin/plans`: platform subscription plans
- `https://sghomesinterior.in/admin/domains`: platform domain control center

**Navigation rule:** do not offer a second business-dashboard link in the Super Admin sidebar. A successful login still passes through `/dashboard`, where the server immediately routes fully authorized platform-dashboard users to `/admin` before rendering a tenant overview. This preserves all existing tenant module routes and prevents organization Owners from being mistaken for platform administrators. If a platform administrator also needs tenant operations, visit an explicitly authorized tenant module; do not expose tenant-only data in platform aggregates.

Keep `BUSINESS_OS_SERVICE=business-app` in the single Hostinger website. Set `APP_ORIGIN=https://sghomesinterior.in`, `APP_ENV=production`, `SUPABASE_ENVIRONMENT=production`, and use **real, validated** production Supabase credentials and all the existing required Business App signing keys and public delivery origin. Restore the original keys if a platform-admin .env template with placeholder values was imported: an invalid public URL, publishable key or recovery key causes a startup 503. The `PLATFORM_ADMIN_ORIGIN` variable is no longer used by the in-app Super Admin entry point and can be omitted.

Use Node **24**, project root `./`, entry `server.js` and `npm run hostinger:build` (or the repository's validated hosted postinstall build path). Hostinger may label the custom Node runtime Express; the server actually launches native Next.js. The build must show **Business App** routes including `/admin`, and runtime logs must identify `business-app`. Do not treat a successful publish as proof of a successful app start.

The `/admin` layout calls `requirePlatformPermission('platform.access')` server-side and its screens/actions have their own platform permission requirements. Being a tenant Owner does NOT grant platform Super Admin. The tenant's CRM, finance, quotation and project data remain tenant-isolated and are not made platform-readable by this change. Do not bypass RLS or create blanket support impersonation.

Before releasing, validate staging, schema compatibility, two-tenant RBAC/RLS and denied admin access, recovery/login, static assets, all feature route navigation, then live Auth and DNS/TLS acceptance. The repository production checklist may still be **NO-GO** for a full hosted release; a successful CI run does not supersede those gates.

### Diagnose an `/admin` 404 or favicon 503

On the same deployed origin, check these URLs **in order**:

1. `/api/health` — 200 `alive` proves the Next.js process is receiving requests; upstream 503 means check Hostinger **runtime**, environment validation and service restart logs first.
2. `/api/ready` — 200 `ready` indicates the configured public Supabase project responds to the database readiness RPC; 503 requires Supabase/project/migration/network investigation.
3. `/api/admin-access` — authenticated, no-store and read-only access check. 200 with `dashboardAccess: true` means the current session has the three required platform permissions; 401 means sign in again, 403 means the _current signed-in user_ has insufficient rights, and 503 means a backend/auth dependency failed. The `configuredProject` value is the public project identifier, useful for verifying that Hostinger and the actual role assignments refer to the **same** Supabase project. This endpoint never emits emails, signing keys, JWTs or secret credentials.
4. `/admin` — the existing restricted UI intentionally renders 404 for forbidden sessions; the built route's existence alone does not grant access.

A missing browser `/favicon.ico` request is not evidence that `/admin` is missing. For an upstream 503, first capture Hostinger runtime logs and check that `BUSINESS_OS_SERVICE=business-app` and all required production environment variables are valid. The Business App provides a brand SVG icon and same-origin legacy favicon redirect; if favicon still responds 503 **along with /api/health**, repair the upstream server first. If `/api/health` is 200 but the browser shows stale 404, use a private window or clear that site's cache. Do **not** seed platform roles in production or reassign permissions as a troubleshooting shortcut.
