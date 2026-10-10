# Company dashboards: central paths and custom domains

## URL contract (configurable)

A business has one organization UUID and a stable unique `organizations.slug`.
The platform **domain is configuration**, not a company identifier.

| Incoming URL | Tenant selection | Service |
| --- | --- | --- |
| `https://sghomesinterior.in/neelima-construction/dashboard` | Authenticated membership in slug `neelima-construction` | Business App |
| `https://sghomesinterior.in/neelima-construction/dashboard/crm` | Same slug, same company | Business App |
| `https://neelimaconstruction.com/dashboard` | Verified active custom hostname mapped to company | Business App |
| `https://neelimaconstruction.com/dashboard/finance` | Same hostname, same company | Business App |
| `https://neelimaconstruction.com/` | Public published website for hostname | Websites App |

These URLs are illustrative; there is **no live connected tenant** named in this file.

If `BUSINESS_OS_CENTRAL_HOSTNAMES` changes in future, the application uses
the new hostname without changing organizations, database IDs, company slugs
or external custom-domain records. The domain must also have DNS, a valid TLS
certificate and routing to the Business App origin. Removing the old platform
domain is a separately planned migration, including OAuth/email links.

## Application configuration

Set on the **Business App server**, not in browser variables:

```dotenv
# The hosted Business App origin (the current central dashboard host).
APP_ORIGIN=https://sghomesinterior.in
BUSINESS_OS_CENTRAL_HOSTNAMES=sghomesinterior.in
# Set to true only AFTER production routing, database migration and
# allowed customer dashboard origins are configured and verified.
BUSINESS_OS_TENANT_ROUTES_ENABLED=false
```

The route flag defaults to **off**, preserving the existing unprefixed
`/dashboard` for currently deployed users until infrastructure is ready.
Development includes localhost as a central hostname automatically.

When enabled, the Business App Next.js proxy:
1. Removes caller-provided internal workspace headers.
2. Rewrites `/<slug>/dashboard/*` to the existing `/dashboard/*` route,
   setting the selected slug in a same-site, host-only HTTP-only cookie
   for navigation. The URL in the address bar remains prefixed.
3. Redirects normal `/dashboard/*` links on the central host back to the
   company-prefixed URL. Server Actions avoid a cross-path HTTP redirect and
   are instead server-scoped to the selected company.
4. For non-central customer hostnames, scopes `/dashboard/*` to an **active,
   published, DNS-and-HTTPS-verified website domain** through
   `workspace_organization_for_hostname`.
5. Rejects platform administration URLs under customer hostnames.
6. The server independently validates the current authenticated user's
   company membership and permissions. The route cookie is **not** trusted
   for authorization. Replacing it with a different slug never grants access.
7. The platform can change company selection on the central domain;
   a custom domain is always locked to the organization owning that hostname.

### Required database migration

Apply `packages/database/supabase/migrations/20261010000600_workspace_host_routing.sql`
to the **verified, correct** target environment. Do **not** assume staging
and live database projects are interchangeable. The new RPC returns a
company UUID only for a verified, published hostname **and** a current
authenticated member; its EXECUTE permission is authenticated-only.

## Required edge/origin architecture (NOT yet deployed)

The product currently builds two **separate Next.js deployments**:
`business-app` and `websites`. Linking a custom domain in the database
does **not** route `/dashboard` to the Business App automatically.

A reverse proxy or edge router must deliberately route **by both hostname
and path**:

- **Central host:** `/<slug>/dashboard/*`, `/dashboard/*`, `/login`,
  `/auth/*` and application action/API routes -> Business App.
- **Customer hostname:** `/dashboard/*`, `/login`, `/auth/*`,
  `/forgot-password`, `/reset-password`, `/register` and
  authenticated application action endpoints -> Business App.
- **Customer hostname:** `/`, public pages, public enquiry forms, site
  assets and sitemap -> Websites App.
- Block all `/admin/*` access under customer domains.
- Ensure all Browser, Server Action, RSC and public form requests use
  consistent routing to the appropriate app; never route form POSTs to the
  wrong app.
- Maintain the actual **customer hostname** in the forwarded `Host` for
  business-app domain resolution, and configure trusted proxies to prevent
  arbitrary external host-header injection.
- **Next.js assets need separate namespaces/hosts.** Both applications
  normally emit `/_next/*`; blindly splitting only `/dashboard` will
  break scripts and CSS. Before live activation, provide distinct
  static-asset hosts/prefixes or a tested deterministic asset router and
  ensure both apps' CSP settings permit their specific asset origins.
- Browser auth cookies must remain host-only, Secure, HTTP-only and
  SameSite=Lax. A central-domain login is **not** automatically a login on
  `neelimaconstruction.com`. Users must sign in on the customer domain,
  or a separate short-lived server-verified SSO handoff must be built.
  Never copy raw Supabase refresh tokens across domains.
- Password-based sign-in works through the existing host-local server flow.
  Email confirmation/recovery and third-party OAuth redirects require an
  explicit approved redirect/callback strategy for customer domains.
  Do not enable dynamic OAuth redirects for arbitrary customer hosts.

### Apex/root domains

`neelimaconstruction.com` (without `www`) is a root/apex domain. The
existing managed Cloudflare onboarding code checks a canonical CNAME;
registrars without CNAME flattening cannot always satisfy that. Configure
an apex-capable DNS/proxy solution or redirect the root to a supported
`www` hostname. A fully general automated apex connector is NOT claimed
as complete; validate with the actual registrar and Cloudflare before use.

## Go-live tests

- [ ] Confirm the actual `APP_ORIGIN`, central hostname(s), TLS and routing.
- [ ] Deploy and verify Business App + Websites App asset segregation.
- [ ] Confirm correct Supabase target, apply workspace hostname migration,
      check tests and RLS policies.
- [ ] Test a real tenant on `/<slug>/dashboard` and a real verified custom
      domain on `/dashboard`, including nested CRM, quotes, forms and assets.
- [ ] Attempt access with another tenant's user and with forged
      `business-os-workspace-route` cookie and internal headers. Deny access.
- [ ] Verify cross-tenant logout, login on custom host, and host-only cookies.
- [ ] Test company switching on central domain and ensure it cannot switch
      companies on a customer domain.
- [ ] Test public website on customer root and dashboard on same hostname.
- [ ] Only then change `BUSINESS_OS_TENANT_ROUTES_ENABLED=true`.

At present these external routing and production tests have **not been
completed**. Code alone is not evidence of a working live domain.
