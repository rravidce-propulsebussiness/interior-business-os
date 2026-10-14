# Construction Execution OS — Phase 9 Procurement Readiness

Status: **draft GitHub implementation**, stacked on PR #96 and earlier
construction phases; not deployed.

This increment connects the approved Phase 8 tomorrow planner to the
**existing Site Delivery material requests**. It does not create a
competing marketplace, purchasing system, inventory ledger, or payments
engine.

## What it does

Managers and authorized procurement staff can see an upcoming 14-day
materials queue tied to the exact approved work date and construction
floor/stage. Each material retains its existing request quantity and
unit, real vendor/purchase-order reference, and workflow status:

- **Requested:** requires approval or rejection through the existing
  `project_site_command('material_update')`.
- **Approved:** the original request needs an actual marketplace or
  outside-supplier order and a real vendor/PO reference.
- **Ordered:** real delivery is still pending; an order does not mean
  stock was received.
- **Received:** staff have manually marked site receipt through the
  original workflow. This does **not** create or substitute for a
  canonical `goods_receipt` or `inventory_transaction`.

A material used in multiple approved plans appears once in the UI with
all planned uses and a sum of required quantities. If that sum exceeds
the original request quantity, the UI warns the manager to reconcile
the request; it does not claim a live inventory shortage.

## Permissions and trust

The queue's database read RPC verifies active tenant membership,
project access and manager or explicitly assigned procurement/storekeeper
role. It never exposes financial contracts, supplier payments or
unapproved site plans. The UI permits status changes only if the
original site's `private.site_allowed` policy and execution phase
are both satisfied, and the server action calls that unchanged
`project_site_command`; no duplicate status-change path exists.

A site engineer can prepare tomorrow's material requirements in the
planner, while commercial ordering remains a separate manager or
procurement action. Watchmen and clients cannot read the queue.

## Remaining integration

The existing Site Delivery material status reflects manually supplied
seller or order evidence. The marketplace Orders and Operations Stock
systems remain the authority for actual purchase orders, material lot
receipts and on-site inventory. This phase does not yet link a Site
Delivery material need to a typed and issued canonical purchase-order
line. A future phase should introduce the safe foreign-key mapping and
reconciliation before it can claim system-verified order or receipt.

All migrations and UI changes require isolated test database checks,
regressions, TypeScript, recovery, and build verification before merge.
No live Supabase database has been migrated.
