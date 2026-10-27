# Business OS website-first entitlements (Growth, Scale, direct)
 
## Entitlement contract

**ProPulse Growth** receives one Business OS-hosted, template-based website with up to eight pages, 20 MiB of media, a managed subdomain, and the ability to **connect a domain they purchased separately**. Full CRM, website contact forms and project management are not included. Display direct phone, email and contact links on a page instead. Templates must be published by platform admin.

**ProPulse Scale** receives the currently active Business OS modules, including projects, CRM, quotations, billing and hosted websites, while the Scale membership is active. The linked organization retains one company and its data through Growth/Scale transitions.

**Direct customers** register on the `website_pending` plan with **no free module grants**. On verified payment, a platform administrator can assign `website_basic` (template website, Business OS hosting, own-domain connection) or `business_os_complete`. Prices and automated checkout have **not** been configured; do not claim payment is collected or activate a plan based on a browser request. Admin plan assignment uses the existing guarded Organization detail workflow. Upgrades must not delete or copy existing websites, SSL/domain rows or project records.

A customer's registrar sells/renews their domain. Business OS only handles host routing, site publishing, DNS ownership verification, TLS readiness and hosting. An apex/root hostname needs separately supported DNS routing; www subdomains are the existing recommended flow.

## Cross-app evidence

The ProPulse OAuth UserInfo endpoint now returns `business_os_access`:
```json
{"tier":"growth","expires_at":"2030-01-01T00:00:00.000Z"}
```

The actual tier and expiry are read from active ProPulse `pro` membership rows, not the user role, email, browser claims, or a company-supplied tier. Missing/expired memberships return `{"tier":"none","expires_at":null}`. Business OS obtains the claim using the server-held provider token after verifying the linked `custom:propulse-business` Supabase identity. The new **4-argument** service-role-only `propulse_company_import` RPC replaces the earlier 3-argument all-module trial. Never re-enable the legacy callable signature.

ProPulse memberships are re-synced **on a new OAuth sign-in**. Expiration is enforced through stored `valid_until` even without another login. **Renewals and upgrades are not pushed live to already logged-in Business OS sessions**: the user must reconnect via /auth/propulse until a separately authenticated subscription-change webhook is built. Do not represent this as real-time membership sync.

The integration removes/replaces only `source='promotion'` grants with `configuration.source='propulse'`. It preserves other tenants, owner membership, independently purchased module add-ons, and non-ProPulse promotions. Existing directly paid plan assignments are not overwritten. An old ProPulse-linked organization on the legacy default plan is remapped only if the ProPulse source promotion identifies it. Legacy generic 90-day promotions require a separate reviewed migration; they are not silently deleted.

## Backend enforcement

- `private.entitled` gates per-module API/database operations; a hidden sidebar is not a security control.
- `private.website_config` merges plan website limits and website add-ons. `template_only=true` requires a **published** catalog template. The public blank-site RPC rejects template-only plan users, while `website_from_template` uses a private, authorization-checked creation path.
- Construction, interior and general-service templates are seeded *if a real platform admin user exists*. If zero platform admin identities exist at migration time, publish templates from /admin/website before opening access.
- Existing website domains are handled at /dashboard/website/<site-id>/domains; /admin/domains handles platform routing. `custom_domain=true` is enabled for website_basic, Growth and Scale. Customers do **not** receive domains from Business OS.

## Deployment and acceptance gates

1. Verify the actual production DB project from runtime configuration. Back it up, test restore and review migrations before any production apply.
2. Deploy the ProPulse UserInfo provider change and the Business OS provider claim validation in a staged sequence; don't enable new sync when the other side still expects the previous contract.
3. Apply 20261027000000 through 20261027000300 in order, after every prior migration. Run SQL suites `propulse-company-sync.sql` and `website-templates.sql` on an isolated PostgreSQL test DB.
4. Set a real `website_platform_settings.base_domain` and verify the Business OS Websites app origin, DNS/TLS adapter and hostname routing. Merely publishing a source change does not establish live hosting.
5. Test Growth can copy/edit/publish a published template but cannot create a blank site, edit custom code, or call project RPCs. Test Scale project actions with tenant isolation. Test loss of ProPulse membership and preservation of separately purchased modules.
6. Test custom-domain TXT + CNAME ownership and HTTPS, including a foreign domain rejection. The domain remains registered to the customer, not Business OS.
7. Test a direct customer's pending account cannot create a website until a verified-payment administrator sets `website_basic`. Test that plan change preserves an existing site.
8. Roll out to a disposable tenant before broad customer access.

**Not implemented in this release:** paid subscription checkout/price catalog, provider webhooks for immediate renewals/upgrades, free website enquiry inbox without CRM, automatic custom-domain registration, automatic production DNS/cert provisioning before the hosting adapter is configured. Do not market these as complete.
