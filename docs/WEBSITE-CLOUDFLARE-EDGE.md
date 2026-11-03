# Business OS public websites and customer-owned domains

The existing `apps/business-app` Hostinger Node.js deployment serves:
- the Business OS platform at `sghomesinterior.in`;
- managed company subdomains such as `company.sghomesinterior.in`;
- customer-owned apex and subdomain hostnames such as `company.com` and `www.company.com`.

All website requests are forwarded through a signed Cloudflare Worker to the existing Business OS origin. The application uses the signed original hostname only after HMAC verification. The public `website_public(text)` database function then requires an exact registered hostname, active domain state, TLS-ready state, a published website/version and website entitlement.

## 1. Cloudflare for SaaS prerequisite

Customer-owned domains require Cloudflare for SaaS on the provider zone and an allocated custom-hostname quota. The Cloudflare API currently returns a no-quota / feature-not-enabled response until this is provisioned. Do not advertise customer-owned domains as live until the fallback-origin and custom-hostname APIs are available.

Enable Cloudflare for SaaS for the `sghomesinterior.in` zone and obtain hostname quota. Cloudflare API token permissions must allow reading/writing custom hostnames and the fallback origin.

## 2. Configure the fallback origin and CNAME target

Use a Worker as the fallback origin. In the `sghomesinterior.in` DNS zone configure:

| Type | Name | Target / content | Proxy |
|---|---|---|---|
| AAAA | `proxy-fallback` | `100::` (originless Worker fallback) | DNS only |
| CNAME | `customers` | `proxy-fallback.sghomesinterior.in` | Proxied |

Set the Cloudflare for SaaS fallback origin to:
`proxy-fallback.sghomesinterior.in`

Customer DNS records must point to the CNAME target:
`customers.sghomesinterior.in`

The fallback origin is a Worker origin, not a Hostinger IP. The CNAME target is the customer-facing DNS target. Do not point customer domains directly to the Hostinger IP.

## 3. Worker routes and service-host exclusions

Deploy `infra/cloudflare/public-company-sites/worker.mjs` with route:
`*/*`

The broad route is needed because Cloudflare for SaaS custom hostnames enter the provider zone while retaining the customer's original Host header. More-specific no-Worker routes must be preserved for provider-owned hosts so the catch-all does not intercept the platform or mail services:

- `sghomesinterior.in/*`
- `www.sghomesinterior.in/*`
- `admin.sghomesinterior.in/*`
- `api.sghomesinterior.in/*`
- `auth.sghomesinterior.in/*`
- `dashboard.sghomesinterior.in/*`
- `login.sghomesinterior.in/*`
- `register.sghomesinterior.in/*`
- `sites.sghomesinterior.in/*`
- `mail.sghomesinterior.in/*`
- `webmail.sghomesinterior.in/*`
- `ftp.sghomesinterior.in/*`
- `autoconfig.sghomesinterior.in/*`
- `autodiscover.sghomesinterior.in/*`

Set these exclusion routes to **Worker: None**. Keep the existing first-level company-subdomain route if desired; the catch-all route also covers managed subdomains.

Never remove or replace the apex/www bypasses when deploying the Worker. Do not use the catch-all route without these more-specific exclusions.

## 4. Hostinger Business App environment

Keep the existing application and set these server-only variables in the existing Hostinger Node.js app:

```env
BUSINESS_OS_SERVICE=business-app
BUSINESS_OS_PUBLIC_WEBSITE_ROUTING_ENABLED=true
BUSINESS_OS_PUBLIC_WEBSITE_BASE_DOMAIN=sghomesinterior.in
BUSINESS_OS_PUBLIC_EDGE_SECRET=<same random secret as the Worker>
CLOUDFLARE_SAAS_ZONE_ID=<provider zone id>
CLOUDFLARE_SAAS_API_TOKEN=<private token>
CLOUDFLARE_SAAS_FALLBACK_ORIGIN=proxy-fallback.sghomesinterior.in
CLOUDFLARE_SAAS_CNAME_TARGET=customers.sghomesinterior.in
```

The Worker secret `BUSINESS_OS_PUBLIC_EDGE_SECRET` and Hostinger secret must match exactly and remain private. Restart/redeploy the existing Node app after changing environment variables.

## 5. Customer onboarding: www and root domain

Each customer hostname is registered separately in Website Studio → Domains. A customer may add both:
- `www.customer.com`
- `customer.com`

Business OS shows a per-hostname ownership TXT challenge. The customer also adds any Cloudflare hostname/SSL TXT validation records returned by Cloudflare.

### www / other subdomain

At the customer's DNS provider:
- CNAME host: `www`
- Target: `customers.sghomesinterior.in`
- Use DNS-only unless the customer's Cloudflare zone has the required SaaS O2O configuration.

### Root / apex

At the customer's DNS provider, point the root host `@` to `customers.sghomesinterior.in` using one of:
- ALIAS;
- ANAME;
- provider-supported CNAME flattening.

A standard DNS CNAME is not allowed at the zone apex by many providers. An A-only apex setup is not supported by the default CNAME-target configuration; Cloudflare Apex Proxying or another explicitly configured apex-proxy service is required. Never give customers a guessed A-record IP.

### Activation checks

Cloudflare custom hostname readiness requires both:
- custom hostname `status = active`;
- certificate `ssl.status = active`.

Business OS also requires its own TXT challenge to match. Only then may the domain verification RPC mark the record active and TLS ready. The database remains the final authorization gate.

## 6. Website plan entitlement

Custom domains remain a plan capability. Enable `custom_domain=true` only on the website plans/add-ons that should include the feature. The owner UI hides the add-domain form when their plan does not include it; the database RPC independently enforces the entitlement.

Managed `*.sghomesinterior.in` company subdomains are separate and do not require the customer-owned-domain entitlement.

## 7. Verification and rollback

Test:
1. `https://sghomesinterior.in/api/health`
2. an active managed company subdomain homepage and nested page;
3. a registered `www.customer.com` hostname;
4. a registered apex `customer.com` hostname using flattening/ALIAS/ANAME;
5. assets, enquiries, robots.txt and sitemap.xml;
6. an unknown hostname and an unpublished website both return 404;
7. apex, www, login, dashboard, admin and mail hosts still behave normally.

Rollback customer-owned routing by removing the Cloudflare for SaaS custom hostname and the customer CNAME record, then restore the previous Worker route set. Do not disable managed company subdomains or change the Business OS apex DNS while rolling back customer domains.
