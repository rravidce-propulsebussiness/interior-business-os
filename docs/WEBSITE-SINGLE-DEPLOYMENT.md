# Business OS + company public websites on one Hostinger Node.js app

This is an opt-in deployment mode for the existing `apps/business-app`.
It does **not** require a second Node.js application or another Supabase project.

## Application routing

- `https://sghomesinterior.in/` and `/dashboard` keep their existing Business OS behavior.
- `https://<slug>.sghomesinterior.in/` is internally rewritten to the
  published-site renderer, including nested pages, `/assets/:id`,
  `/api/enquiry`, `/robots.txt` and `/sitemap.xml`.
- Only valid first-level company slugs are accepted; service names
  (`www`, `sites`, `mail`, `admin`, etc.) remain excluded.
- The shared renderer checks the exact Host header against the
  `website_public` RPC and published version on **every request**;
  unknown/draft/inactive/unverified sites return 404.
- `/public-site` is an internal rewrite target and cannot be browsed directly.
- The separate `apps/websites` service remains supported for existing deployments.
- External custom domains are **not enabled by this managed-subdomain routing change**.

## Hostinger configuration

Keep the existing `sghomesinterior.in` Node.js deployment and
`BUSINESS_OS_SERVICE=business-app`. Deploy this change through its normal
GitHub `main` auto-deployment.

Only after wildcard DNS + HTTPS and origin host routing have been verified,
add in the **existing** Hostinger application's environment:

```env
BUSINESS_OS_PUBLIC_WEBSITE_ROUTING_ENABLED=true
BUSINESS_OS_PUBLIC_WEBSITE_BASE_DOMAIN=sghomesinterior.in
```

Restart the Node.js app to apply the environment change.

**DNS and SSL are external prerequisites.** This PR cannot create Hostinger
wildcard virtual hosting, install a wildcard certificate or ensure the proxy
passes the original Host header. Do not switch the platform
`managed_subdomain_tls` flag on merely because SQL rows exist.
Do not change the apex, `www`, MX, SPF or DKIM records.

## Activation checklist

1. Confirm `website_templates`, `website_platform_domain_registry(integer)`,
   and `website_public(text)` exist in the **Business OS** Supabase project.
2. Add the managed subdomain to `website_domains` for the published site,
   initially `pending` with `tls_status=pending`. Avoid duplicates.
3. Configure and confirm wildcard DNS, TLS certificate and Host-preserving
   ingress routing **to the existing Business OS app**.
4. Enable the environment flag above, then test
   `https://neelima-constructions.sghomesinterior.in/` and a nested page,
   public media, enquiry POST, sitemap and robots.txt.
5. Only after live HTTPS works, have the platform operator transition the
   domain to `active`, `tls_status=ready`, with a verified timestamp using
   the authorized domain workflow. Do not fabricate a TLS-ready status.
6. Confirm `https://sghomesinterior.in/login`, dashboard and admin still work.
7. Confirm unpublished/unknown company subdomains and direct
   `/public-site` paths return 404.

If hostname routing cannot be enabled by the existing Hostinger plan,
use an HTTPS reverse proxy capable of forwarding the company Host to the
app's existing origin, or choose a compatible hosting plan. Do **not**
create a second app just to make the source code render company pages.
