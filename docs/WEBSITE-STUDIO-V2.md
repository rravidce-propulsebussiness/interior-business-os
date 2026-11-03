# Website Studio v2 — templates and independent Git projects

**Development branch only. Not deployment-verified.**

## Policy and tenancy

- One website per business by default. A subdomain and a custom domain refer to the same website, not two websites.
- The existing database website-create RPC, organization locking, RLS, ownership and plan/manual-entitlement `sites` limit remain authoritative.
- Super Admin may allow a larger count via plan capability or existing manual entitlement. Existing websites are not deleted when limits decrease.
- Each website has one source record: managed template or independent Git repository. The source metadata is stored in a tenant-scoped table with restricted RLS and checked RPC mutations.
- A website's frontend and backend repository can use any language, but actual execution belongs to its own isolated hosting environment, never the Business OS runtime.

## UI changes

`/dashboard/website` provides the new template gallery, Git/VS Code options, website list, quota, domains, source links, and deployment metadata. Built-in managed templates: Construction & Interiors, Interior Studio, Real Estate and Corporate.

The legacy editor tabs redirect to the new dashboard; existing published pages and the public snapshot renderer are preserved. `/dashboard/website/[id]/domains` retains existing DNS/HTTPS setup.

The new RPC `website_project_create` atomically calls the existing `website_create` and stores its source; `website_project_configure` supports updates with optimistic concurrency; `website_project_list` scopes project read access.

## External deployment is intentionally separate

Repository connections store only a credential-free HTTPS source URL, branch, framework label, and optional deployment URL. GitHub sources can be opened in VS Code for Web. Saving a repo URL does NOT clone, build, deploy or proxy arbitrary application code.

The existing Business OS public renderer serves **only managed published snapshots**. It cannot yet route a managed subdomain or custom domain to an arbitrary external repository runtime. Full-code sites must currently be hosted separately with provider-managed DNS/SSL. A future gateway needs verified origin ownership, strict TLS, SSRF prevention, cookie isolation, quotas, redirects, and auditability. Do not represent a connected repository as a deployed live website.

## Acceptance before merge or production

1. Apply additive migration `20261103000000_website_project_sources.sql` to disposable staging; regenerate database types with `pnpm db:types` and run `pnpm db:types:check`.
2. Run formatting, lint, typecheck, unit tests, database tests, builds and Playwright. None of these are claimed as executed here.
3. Validate one-site quota; optional higher plan or Super Admin exception; simultaneous creates; no cross-tenant source access; stale source update; slug uniqueness.
4. Test starter initialization, explicit signed template publishing, existing published-site compatibility, subdomain/HTTPS, custom-domain TXT/CNAME and SSL.
5. Test external frontend and backend deployment independently. Do not claim automatic deployments, arbitrary-language hosting, Git OAuth or external domain routing yet.

No legacy published website or domain was intentionally removed by this change.
