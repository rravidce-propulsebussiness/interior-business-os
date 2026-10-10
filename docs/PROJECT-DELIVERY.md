# Construction and interior project delivery workspace

Tenant URL: `/dashboard/projects/<project-id>/site`. Platform controls:
`/admin/control/projects` (only entitlement and company configuration;
platform admins do **not** get access to customer project data).

## Flow
After a customer project has been created from the existing CRM/quote/contract
flow, an authorized project manager initializes the delivery workspace.

1. **Design stage:** assign architects and structural designers. Three
   revisioned deliverables (architectural plan, 3D and structural design) must
   each have their **latest** revision approved by the project manager.
2. **Client confirmation:** the manager records specific client approval
   evidence (date, communication or signed reference) and authorizes start.
   This is a staff-recorded acknowledgement, **not** a digitally verified
   customer signature. Direct customer acknowledgement needs an authenticated
   client portal before this can be described as client self-approval.
3. **Execution:** manager assigns site engineer, watchman, quality inspector,
   procurement, etc. Site engineers submit date-based progress reports
   including completed work, tomorrow's plan, blockers, labor counts, checks
   completed and still required.
4. **Materials and suppliers:** site material needs record requested quantities
   and units. Manager/procurement reviews them and records market seller or
   outside supplier origin and the actual purchase/supplier reference. **This
   is not a purchase order** and does not reserve stock, pay sellers or
   create invoices. Use the existing approved estimate, RFQ, purchase order,
   goods receipt and marketplace screens for those operations. Quantities
   are not automatically derived from plans or structural drawings.
5. **Quality and security:** register site checks including marking, steel
   cover, curing, etc. Log watchman material arrivals, visitors, labour and
   curing/security rounds separately from commercial/financial records.
   Formal quality inspections, snags, stock ledger and task planning remain
   in the existing Operations module.
6. **Handover:** blocked until all recorded site checks pass, material needs
   are resolved, and the existing Operations physical readiness checks pass
   (tasks, formal inspections, and snags).

## Access controls
- Requires authenticated active organization membership and Projects module
  entitlement, plus either the company's `project.manage` permission or a
  project-specific role assigned by a manager.
- Assigned role affects both RPC mutation permissions and the data returned
  by `project_site_read`; watchman access has no client design, material
  pricing, or purchase information. Procurement handles sourcing, not client
  drawing approval. Architect and structural designer cannot approve their own
  drawings or start execution.
- Private tables use RLS forced on and have **no direct anon/authenticated
  grants**. Strict SECURITY DEFINER functions check org, project, role and
  allowed actions, and log each mutation. Cross-project ID substitution is
  rejected; role changes require a currently active organization member.
- Media is stored privately in PostgreSQL bytea and served only by a
  same-origin authenticated route. Max 8 MiB per file, 150 files per project.
  Accepted file types: JPEG/PNG/WebP, PDF and short MP4; magic bytes are
  validated. It is a conservative temporary store for modest evidence
  volumes, **not** durable scalable video hosting; larger files should
  migrate to private Cloudflare R2 with signed access.
- No billing or procurement costs are exposed in the site delivery RPC.
- Project members remain separate from broad organization-wide financial
  permissions and from the original Operations plan assignment table.

## Deployment
New migration: `20261010000700_project_delivery.sql`. Apply only to the
verified correct database. Generated RPC types committed with the migration.
The corresponding Business App must be deployed after migration. **The
migration is not automatically installed in production by merging the PR.**

No live customer approval, marketplace purchase, field video or site action
has been claimed as verified. Test with at least one manager, architect,
structural designer, engineer and watchman on staging and validate that
cross-organization and cross-project requests are rejected.
