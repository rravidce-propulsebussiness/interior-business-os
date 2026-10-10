# Website domains and HTTPS

Platform Admin configures the base hostname and confirms externally configured wildcard routing and TLS. Configure the reverse proxy or hosting platform to forward the original Host to the Websites application. Never route Business App cookies to tenant website origins. Changing the base hostname does not rename existing domain records.

A business with custom-domain capability adds its hostname, then creates TXT _business-os.HOST with the exact business-os-verification=CHALLENGE value and a CNAME to the configured platform hostname. Each hostname has one active claim; pending claims do not serve content. Removal immediately stops resolution. Domain changes are tenant-scoped, audited and version checked.

The verification action resolves TXT and IPv4 A records on the server, compares target addresses to the platform destination, rejects private/special addresses and pins the verified address for a TLS connection using the hostname as SNI. It validates the certificate and records DNS and TLS states separately. A short-lived HMAC attestation binds the exact organization, domain, hostname and challenge. Browser-supplied verified=true is never accepted.

Certificate issuance is the deployment platform's responsibility. This code verifies an already provisioned certificate; it does not impersonate an ACME issuer or claim automatic provisioning. IPv6-only and proxy configurations with nonmatching address sets require an additional deployment adapter. Until DNS and TLS pass, the custom domain does not serve a website. Live DNS, certificates and hosted wildcard routing have not been tested locally.


## Optional automatic HTTPS with Cloudflare for SaaS

The existing manual DNS/TLS verification continues to work without Cloudflare
credentials. The Business App now also has an optional Cloudflare for SaaS
provisioning adapter. **This is not enabled by default.** Configure the
following **server-only** environment variables on the Business App deployment
after setting up Cloudflare for SaaS:

- `CLOUDFLARE_SAAS_ZONE_ID`: the 32-character Cloudflare zone ID for the
  SaaS zone (not the customer's zone).
- `CLOUDFLARE_SAAS_API_TOKEN`: a scoped Cloudflare API token authorized to
  list and create custom hostnames in that zone.

Never expose the token with a `NEXT_PUBLIC_` prefix. Provision a proxied
fallback origin and CNAME target in Cloudflare for SaaS first, and configure
the same **CNAME target hostname** as the Business OS
`website_platform_settings.base_domain` using Admin → Website. The shared
Websites app origin must accept incoming tenant `Host` headers and retain
separate authentication/cookie boundaries.

### Onboarding a company domain

1. Publish a tenant website and enable the organization's custom-domain
   website entitlement.
2. In Website Studio → Domains, enter a **subdomain** such as
   `www.customer.com`. The database reserves it for exactly one tenant;
   Cloudflare registration is attempted after successful database creation.
3. At the customer's registrar, add the Business OS TXT ownership challenge
   `_business-os.www.customer.com` and a CNAME for
   `www.customer.com` pointing to the configured platform CNAME target.
4. Select **Verify DNS and HTTPS**. In Cloudflare mode, the server verifies
   the tenant-specific TXT token, the CNAME target, and both Cloudflare custom
   hostname status and SSL status. The server also retries provisioning when
   an earlier Cloudflare request failed.
5. If Cloudflare returns optional ownership or certificate-validation TXT
   records, the website UI displays those additional records. Add them at
   the registrar and verify again. A domain serves a tenant website only after
   the existing signed database verification marks both DNS and HTTPS ready.

**Apex/root domains** (`customer.com` without `www`) are not covered by
the automatic CNAME flow; they require separately configured apex proxying,
DNS flattening or a redirect supported by the customer's DNS provider. Do not
tell customers to use a CNAME at the root unless the provider explicitly
supports it.

**Operational caveats:** Removing a domain deactivates its database routing
immediately; Cloudflare custom hostname resource cleanup is not yet automated.
The platform operator must delete any orphaned Cloudflare hostname and monitor
usage/billing. The Business App must be able to reach the Cloudflare API and
public authoritative DNS. Never enable the automatic mode before verifying
the Cloudflare zone/fallback origin, SaaS entitlement, DNS target and routing
through the public Websites app. Neither a Cloudflare API success nor a
database domain claim alone proves a domain is live. Test with a controlled
domain and confirm the correct tenant website and HTTPS before production
rollout.
