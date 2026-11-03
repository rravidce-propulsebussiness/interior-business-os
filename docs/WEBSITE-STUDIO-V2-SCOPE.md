# Website Studio v2 — implementation status

## Rules

- One website per business is the default. The authoritative `private.website_config` site quota starts at 1, and the transactional `website_project_create` RPC delegates to the existing `website_create` quota check.
- Super Admin can grant a higher website count through the existing plan/organization entitlement configuration. This does not create extra websites automatically.
- A website may have a managed Business OS subdomain and/or a verified custom hostname. Both belong to the **same** website. A future primary-domain/redirect control can choose the canonical address; the existing domain module currently manages hostname claims and HTTPS separately.
- Custom domain DNS, Cloudflare for SaaS activation, and SSL issuance depend on actual hosting/provider configuration. A database row is not proof a domain works.
- Website creation supports a managed template or an independently hosted repository project. No new dashboard visual/code editor is provided.
- Company-specific source connections now support separate **frontend repository**, **backend repository**, **frontend deployment URL**, and **backend deployment URL**, with tenant-scope permissions, optimistic version checks, and validation. Source links are not Git credentials.
- React, Next.js, PHP, Python and other languages are supported as **source/project metadata** for externally hosted apps; the Business OS server does not build or execute arbitrary customer code.

## Existing implementation and additions

- `apps/business-app/src/app/dashboard/website/page.tsx`: tenant-scoped website/source/domain summary.
- `apps/business-app/src/app/dashboard/website/website-foundation.tsx`: new Website Studio dashboard with template cards, repository/VS Code choices, website list, domains and frontend/backend project links.
- `apps/business-app/src/app/dashboard/website/project-actions.ts`: validated RPC operations and template publishing.
- `packages/database/supabase/migrations/20261103000000_website_project_sources.sql`: default site quota, versioned project metadata and atomic creation.
- `packages/database/supabase/migrations/20261103000001_website_fullstack_sources.sql`: separate optional backend metadata and permission-checked RPC.
- Original domains, website publications, historical content and operational modules remain preserved.

## Important limitations / release gates

1. **Independent deployments are not automated.** Users edit in their own GitHub/GitLab/Bitbucket repository and VS Code, then deploy to a compatible isolated host. The entered deployment URLs are references, not deployment triggers or reverse-proxy routing configuration.
2. **Full-stack custom domains need routing integration.** The legacy shared Websites app resolves managed template snapshots. A separately hosted frontend needs gateway routing or provider DNS to its own deployment and a separate TLS/healthcheck flow. Do not say a custom repository site is live solely because the project record or domain claim exists.
3. **Template sites are not arbitrary-language applications.** They use the existing shared snapshot renderer. Exporting/rebuilding them as independent repositories is a future capability.
4. **The domain UI does not yet enforce a single canonical hostname** or redirect aliases. Both address types are supported as claims for the same site. A canonical selector should be added when the routing adapter is built.
5. New migrations must be applied to a controlled staging database before enabling the new UI. Never run schema verifiers against production.
6. Local typecheck, unit tests, real domain/TLS acceptance, hosting/build execution and a production deployment were not run as part of these GitHub edits.

## Verification checklist

- Apply the two additive migrations to disposable staging; validate the `website_project_create` quota under concurrent requests.
- Create a first site; ensure second creation is denied at default sites=1. Raise the site limit through Super Admin and verify second-site creation is permitted.
- Check organization A cannot list, edit or connect code/deployments for organization B.
- Save frontend and backend repository links, verify optimistic version conflicts, invalid hostnames, invalid repository URLs, SQL/RLS denials and audit events.
- Verify custom-domain TXT ownership, platform CNAME/ALIAS, Cloudflare SaaS status, HTTPS and tenant isolation on a test domain.
- Confirm existing template websites, published snapshots, domains, and CRM workflows remain unchanged.
- Confirm independent frontend and backend URLs are hosted, secured and linked by the customer-owned application configuration.
