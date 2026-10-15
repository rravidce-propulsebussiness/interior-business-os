# Quote → Agreement → Construction Timeline

The business should capture construction scope **once** in the quotation, not again in Site Delivery.

## Actual workflow

1. A company creates a construction quotation with floor-wise SFT rows (floor vs
   additional work), package selection, brands/materials and scope sections.
2. The company issues the quote and captures the customer's **approved**
   response through the canonical quotation response system.
3. The user selects **Create agreement and prepare timeline**. The canonical
   `contract_create` RPC accepts only an approved issued revision and freezes
   the commercial source snapshot.
4. The contract handoff reads the immutable accepted quotation items and derives:
   - exactly the quoted structural floor names/levels and quoted areas;
   - a frozen `QUOTED_SCOPE` stage with package/material inclusions, finish
     specifications and additional quoted work;
   - a dependency-aware standard structural work sequence per quoted floor:
     design, excavation, PCC, footings, curing, plinth, columns/slabs, masonry,
     services, finishes and handover.
5. Authorized company owners/project managers initialize the site and
   construction stage snapshot automatically. This is idempotent and will never
   replace a project's existing frozen workflow.
6. The contract page links directly to the construction timeline. The stage
   page **does not ask for floors again**. An exceptional recovery button
   retries from the approved agreement if stage creation was interrupted.

## Not automatic or invented

- A quote without the SFT floor-wise schedule cannot produce a reliable
  construction timeline. It is not replaced by a generic or manually-entered
  floor list. The quote itself must be revised, issued and approved correctly.
- Creating a contract is **not** the same as executing a signed agreement.
  Database-backed signed-agreement evidence and client drawing approvals
  remain required before real construction execution.
- Only planned stage definitions, not actual work percentages, daily reports,
  material quantities, quality passes, curing compliance or purchase orders,
  can be inferred from an accepted quotation.
- The standard construction workflow defines **procedural activities**,
  not extra billable work. Actual commercial inclusions come from the frozen
  quote and any later approved change orders.
- Payment-milestone amounts require an actual activated contract schedule;
  the system must never invent percentages or receipts from a quote total.
- A finance-only account can create an agreement but cannot elevate itself to
  project manager. An authorized manager can use the exceptional sync action.
  If agreement creation succeeds but subsequent timeline setup fails, the
  agreement remains canonical and can be synced safely later.

## Release validation

Run the standard GitHub Foundation checks, especially the new unit tests in
`quote-construction-handoff.test.ts`. On staging, verify approved vs draft
quote, multi-floor vs additional-work rows, missing floor-wise quote, two
simultaneous contract submits, authorized vs finance-only access and a
pre-existing frozen project workflow. Verify there is exactly one contract and
one workflow per project, with no fabricated payments or completed work.

This release introduces **no new SQL migration**. It consumes the previously
installed Site Delivery, Construction Project Workflow and Agreement Gate RPCs.
