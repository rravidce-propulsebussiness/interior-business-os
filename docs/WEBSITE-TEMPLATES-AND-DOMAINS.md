# Website templates and company domains

## Admin workflow

`/admin/website` now contains the shared template library. Create a construction,
services, blank visual or custom-code starting point. Open its studio to edit pages,
header/footer, theme, navigation, example content, SEO and frontend code. Save drafts
and publish a template to make it available to company owners. Archive removes it
from future selection; it does not change websites already created from it.

Editing a published template returns it to draft until it is published again.
Template authoring requires `platform.entitlements.manage`. The existing plan
capability and website suspension controls remain available below the library.

`/admin/domains` now owns platform base-hostname/TLS settings and a paginated
company/domain directory. An authorized platform admin can add, verify and remove
company domains directly, without impersonating owners. This requires the existing
platform organization-management, entitlement-management and catalog permissions.
Domain actions retain the real actor in the audit history. They do not grant access
to a company's unpublished website content.

DNS and HTTPS must still be independently verified using the existing signed
verification protocol. No client-supplied “verified” flag activates a domain.
Platform management supports active and trial companies; suspended/archived
websites and unavailable entitlements are rejected.

## Company workflow

In Website Builder, owners can create a blank website, select a published template,
or open the custom HTML/CSS/JavaScript editor. Template selection copies the layout
into a new company draft in one database transaction. The existing authoring APIs
enforce module access, site/page limits, section permissions and custom-code plan
capabilities. Failure rolls back the whole copy. Later template edits do not change
the company website.

Shared templates contain example content. Company media and source-record references
are deliberately excluded to prevent cross-company asset or business-data leakage.
Add those in the company studio. Forms must be connected and enabled there. Custom
code remains sandboxed frontend HTML/CSS/JavaScript; server-side code and package
imports are not supported.

## URL contract

- Central workspace: `https://sghomesinterior.in/rvconstruction/dashboard`.
- Custom workspace: `https://www.rvconstruction.com/dashboard`, after ownership,
  TLS, website publication and hosting routes are verified.
- A full domain is required; `https://rvconstruction/dashboard` is not a public
  custom-domain configuration.
- Company workspace paths use the organization slug, independently of website slugs.
- Existing tenant-routing and membership checks remain authoritative. An admin's
  “Open company Website Studio” link does not impersonate that company's owner.

## Deployment gate

This source change is not proof of a live deployment. Before deploying:

1. Verify the actual Business App runtime's Supabase project. Do not substitute the
   connected staging project for the live project.
2. Back up that database and verify restoration as required by the deployment plan.
3. Review/apply `20261011103902_website_templates.sql` after its prerequisite
   migrations. It adds the template catalog/RPCs, domain registry and explicit
   platform domain authorization. Preserve all previous migrations.
4. Confirm the existing website signing key matches the database's active build key.
5. Deploy the Business App and test authenticated admin template creation/editing,
   publication, owner copying and custom-code editing. Check plan-denied copies
   leave no partial site behind.
6. For company/custom-domain dashboards, complete the edge/origin, asset namespace,
   callback/origin and TLS setup in `TENANT-WORKSPACE-URLS.md`, then enable
   `BUSINESS_OS_TENANT_ROUTES_ENABLED`. Verify login, nested navigation, Server
   Actions, tenant isolation and logout at both forms of URL.

The UI reports the routing flag; neither that flag nor the wildcard TLS checkbox
proves that external hosting routes and certificates work.

## Validation

Focused renderer/template/routing/Cloudflare tests, TypeScript, ESLint, generated
schema types and the Business App production build are checked locally. The
canonical website SQL suite includes `website-templates.sql`, covering template
visibility, signed publication, stale edits, transactional copies, capability
rejection, isolation, archiving and platform domain authorization/audit behavior.
Local SQL execution uses PGlite (WASM PostgreSQL with pgcrypto), not hosted Supabase;
CI runs the same SQL on PostgreSQL. Live DNS/TLS and authenticated hosted acceptance
remain separate deployment requirements.
