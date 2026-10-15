# Quote → agreement → construction/interior timeline

**New handoff:** After an issued quotation has an approved customer response, the
existing `contract_create` is the only agreement creation path. The returned
contract ID triggers the industry-aware timeline generator in the same
authenticated user flow. `project_quote_timeline_create` checks the canonical
contract, accepted revision, project industry, exact quotation-item fingerprint
and permitted contract creator/manager. It writes a planning-only snapshot and
initializes the _same_ project's existing Site Delivery workspace.

## Construction

Frozen SFT estimate rows labelled as floors become floor instances, rather
than asking users to enter Ground/G+1 again. Additional work, contracted
package name, material brands and selected specifications become a protected
`QUOTED_SCOPE` stage. Construction-specific tasks then follow the existing
structural stage template, preserving dependencies and independent QC.

## Interior

Quote room-wise BOQ items and room names become project area snapshots and
room-specific installation stages. Only trades included in the quote create
specialist phases: civil/tiling, services, false ceiling, fabrication,
installation and surface finishes. Survey, approved drawings, sample/material
selection, independent quality checks, snagging and handover apply as delivery
process controls. A cabinetry-only quote must not grow foundations, RCC,
plumbing or false-ceiling tasks by default.

Sources reviewed for industry sequencing:

- https://www.chamundaconstructions.in/blog/interior-fit-out-sequence-after-possession-mumbai
- https://www.theinteriorstories.com/services/turnkey-execution
- https://www.impulsebranding.in/services/general-contracting/interior-fit-outs
- https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/construction-standards/black-book/change-control-and-management-1st-edition2

## Owner planning changes

The company owner, after a role/tenant check, can edit future stage title,
description, activities and visual sequencing. Every change has a mandatory
reason and a versioned, immutable audit event. Changes to the quoted-scope
stage, staged tasks already linked to actual Operations, or inspected/certified
work are blocked. No financial amount or payment milestone is modified by a
planning edit. Contract-affecting changes follow the canonical change-order
engine, consistent with RICS change-control recommendations.

The former manual floor-entry/install button has been removed from Site
Delivery. The only recovery action invokes the same quotation-derived handoff
for a pre-existing agreement, never a separately authored stage plan.

## Runtime boundaries

- The accepted issued quotation is the commercial input, not a site signature.
- A contract may be pending. Physical site work continues to require recorded
  agreement execution and approved client design; QC and Payments remain
  independent canonical systems.
- No completed work, purchased material, labour, curing confirmation,
  invoices, payment requests or receipts are fabricated.
- Repeat handoffs must reuse the original workflow and never overwrite
  executed stages.
- Interior planning uses the same Project/Contract/Operations navigation and
  tenant scoping, not a second standalone application.
- Legacy projects are not backfilled automatically. The manager may re-sync
  their unique accepted agreement; ambiguous multiple-agreement projects
  require selecting the correct contract.

## Verification & release

Migration: `20261015000500_quote_industry_timeline_owner_edits.sql`.
Apply only to the correctly identified Supabase project **after** the earlier
construction and agreement migrations have been confirmed. Do not claim the
change live before a tested merge/deployment.

`packages/core/src/quote-project-timeline.test.ts` and
`packages/database/tests/quote-project-timeline.sql` verify industry
separation, accepted-record linkage, idempotency, owner edits and preservation
of the frozen quote. Test cross-tenant, finance-only contract creator,
watchman and engineer roles in staging before release.
