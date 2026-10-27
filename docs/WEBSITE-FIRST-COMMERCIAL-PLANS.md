# Website-first commercial plan rollout

## Entitlement contract

- **ProPulse Growth:** one template-based website hosted by Business OS, with a platform subdomain and the option to connect a customer-owned custom domain. No domain registration, purchase or renewals. Project management and full CRM are not part of this tier.
- **ProPulse Scale:** all active Business OS modules, website hosting and customer-owned custom-domain connection.
- **Direct Basic:** separately purchased, affordable hosted template website with custom-domain connection. No full Business OS modules by default.
- Upgrades preserve website, organization and domain records; change only the authorized entitlements/plan.
- The customer supplies and owns the custom domain. Business OS supplies DNS instructions, verification, routing and managed HTTPS when infrastructure is configured.

## Current implementation state

Migration `20261027000100_website_first_plans.sql` establishes the three catalog plans and website capabilities without changing current live customer assignments. Custom domains are enabled for all three catalog plans. This is the first additive release, **not** end-to-end activation.

**Critical blocker:** ProPulse `/api/oauth/userinfo` currently returns authenticated company details but no Growth/Scale membership assertion. Never infer paid status from role, email, membership name in the browser, or query parameters. The ProPulse server must provide a signed/server-authenticated active tier and expiration, derived from canonical membership records, for Business OS to check on login and at renewal/expiry. Prefer a separate scoped service endpoint or explicit profile claim with server-side verification; do not put membership authority in editable `user_metadata`.

**Another blocker:** `website_prepare_crm`, `website_submit_lead`, and `website_publish` require a CRM entitlement for active lead forms. Growth/Basic cannot receive website enquiries using the current form architecture when CRM is disabled. Build a tenant-scoped website enquiry inbox/limited website leads capability (or securely scoped form ingestion) without granting the complete CRM application. Do not pretend enquiries work until this is tested.

**Existing grants:** `20261013000000_self_service_company_onboarding.sql` and `20261013000100_propulse_company_owner_sync.sql` currently grant a 90-day promotion for all active modules to newly created companies. Remove or replace that promotional behavior *in a coordinated follow-up migration* once the ProPulse membership provider and self-service default selection are verified. Existing grants need a controlled transition; this migration intentionally does not revoke them.

## Deployment and acceptance

1. Verify actual runtime Supabase project and migration history first; do not assume the source repo's documented project is production. Back up and restore-test before migration.
2. Apply the additive plan migration in sequence; verify module mappings and plan limits for each new plan.
3. Deploy provider membership verification and tests for Growth, Scale, lapsed, cancelled and forged-tier inputs.
4. Gate direct signup/payment with a verified subscription purchase. Protect database RPCs and RLS, not only sidebar items.
5. Provide a true enquiry inbox for website-only customers, including rate limits and tenant isolation.
6. Confirm base domain, managed TLS, custom domain DNS verification and public routing in the hosted environment. A custom domain's DNS and HTTPS status are independently checked.
7. Test upgrades/downgrades and ensure existing content, website and domain records remain intact.
8. Release only after CI, migration tests, live disposable-user end-to-end tests and deployment verification pass.
