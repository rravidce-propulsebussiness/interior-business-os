# Construction Execution OS — Phase 7 customer-facing progress

**Status:** draft, isolated to GitHub. No production Supabase migration, Hostinger deployment, or automatic notifications.

## Reuse existing project truth

The customer's progress page reflects the existing floor-aware construction
stages, canonical stage clearance (`construction_stage_current`), and
original Site Delivery `site_reports`. There is no second project tracker,
no inferred construction percentage, no duplicate daily reports or customer
payment records.

Existing site engineers continue to create daily reports through
`project_site_command('report_add')`. Project managers review them using
`project_site_manager_command('report_review')`. A positive review is
necessary **but not sufficient** to share a daily report with the customer:
the manager must explicitly publish that report in the Site Delivery page.

The public projection includes only: project display name/code, construction
stage title/floor/phase, currently valid clearance Boolean, and expressly
published approved reports' date, completed work and tomorrow's work.
Excluded: staff names/contact, private documents, material procurement,
contracts, quotations, invoices, paid/unpaid status, internal quality
findings, access permissions, client identifiers, blockers and instructions.

## Link security and lifecycle

- Managers create a random, 256-bit bearer link. The database stores only
  its SHA-256 hash; the raw token is returned once.
- The link defaults to 30 days and cannot exceed 60 days. Issuing a new
  link revokes other links for the same project. Revocation is immediate.
- The dedicated public route `/p/[token]` validates a strict hexadecimal
  token, calls a single narrowly scoped anonymous RPC, and escapes all
  customer-supplied text. It uses no caching, a restrictive CSP, referrer
  suppression, and `noindex` / `nofollow` response headers.
- Anonymous RPC rate limits each share to 50 views per minute. It checks
  expiry, revocation, project state and organization project entitlement
  on every call. It never exposes the token hash or org/project IDs.
- Reports must be both latest-manager-reviewed as approved and latest
  publication event marked published. Publication decisions are append-only
  and auditable. A later changes-requested review or unpublish event
  removes the report from the public projection.
- The owner/manager can list and revoke active links and publish/unpublish
  individual reviewed reports. These writes reuse organization/project
  authorization checks, row locks and existing audit records.
- Client links grant **read-only**, bearer-scoped viewing. They do not
  establish customer identity, digital signature, explicit design
  acceptance, payment authority, or authenticated client messaging.

## Testing and rollout

Disposable SQL tests exercise no-approval denial, report publish/unpublish,
anonymous projection privacy, and immediate link revocation. The code and
schema-derived RPC catalog must pass all foundation checks, recovery and
browser tests. Staging must validate deployment of the exact migration
dependency chain before any production release.

**Security note:** A bearer URL can be forwarded by its recipient. Businesses
should deliver it privately; customers needing identity-based or higher-
sensitivity access require a dedicated authenticated customer portal.
Do not include signed agreements, budgets, engineering drawings, identity
documents or contact details in the published text.
