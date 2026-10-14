# Construction Execution OS — Phase 9: Site Labour Gate Register

Status: **draft, not deployed**. Depends on Construction OS phases 1–8.

## What is implemented

The existing Site Delivery `private.site_gate` table remains the canonical
gate activity log. Phase 9 records structured, append-only worker
arrival/departure **group counts** in `private.construction_gate_labor`.
Every new structured event creates exactly one ordinary
`site_gate(kind='labour')` event within the same database transaction.

The user must be a project owner/manager or a currently assigned watchman
in the existing Site Team or new project-scoped construction roles. This
permission is validated in the database; the UI is not trusted.

Each entry has the site day, labour trade, direction, number of workers and
optional observation. Departures cannot exceed recorded arrivals for the
same day and trade. Existing free-text gate entries remain available but
are not guessed into structured headcounts.

Managers get a read-only reconciliation comparing actual arrival/departure
totals with trade-wise headcounts in the **latest approved** work plans from
Phase 8. Security staff can see only the structured gate events **they
personally recorded**; they cannot read labour forecasts or manager
reconciliation notes.

Managers can append a verified or discrepancy decision for a day with
actual gate events. Every decision captures the latest gate event sequence.
A new gate entry makes earlier verification explicitly **stale** without
rewriting or deleting the previous manager decision.

## Privacy and financial boundaries

- Counts are **not** unique person identity, biometric/face attendance,
  individual timesheets, wage liabilities or payroll.
- An entry never creates or receives a material order, alters inventory or
  records a contractual payment.
- The public customer progress portal does not expose watchman gate notes,
  labour forecasts, worker names or manager reconciliation details.
- Gate event records are tenant/project scoped behind private forced RLS;
  only checked security-definer functions can read/write allowed fields.
- The project must have an active physical Site Delivery execution state
  and canonical agreement clearance before logging labour events.

## Tests and rollout

Disposable DB regression verifies watchman arrival/departure events,
over-departure denial, manager-only verification and permission separation.
Existing construction, finance, curing, role, and portal suites still run.
Generated RPC types, TypeScript, build and browser checks must pass before
merge; live Supabase migrations and Hostinger deployment remain blocked.

Future enhancements include labour contractor rosters, optional attendance
identifiers with consent, approved vendor delivery reconciliation,
offline site capture, and actual-vs-planned labour reporting across days.
They are not simulated by this phase.
