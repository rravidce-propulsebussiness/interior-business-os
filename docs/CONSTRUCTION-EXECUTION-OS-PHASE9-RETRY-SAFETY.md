# Phase 9 construction site-gate retry safety

This follow-up hardens the integrated Phase 9 gate register from draft PR #103.
All changes are on a dedicated feature branch. **Not deployed to production.**

## Why

The watchman records real groups arriving and departing through the canonical
Site Delivery gate history. An HTTP/server-action retry after a network
interruption previously risked submitting the same arrival twice, producing
false on-site counts and stale reconciliation.

## Exact behavior

- The `private.construction_gate_labor` record now accepts an optional
  `request_id` (UUID), with a unique tenant/project-scoped index.
- The existing `construction_gate_labor_command` keeps its public arguments
  and privileges. Older callers without a request ID continue to work.
- The Site Delivery gate form now generates **one** UUID per logical
  arrival/departure submission, preserves it after a failed response, and
  rotates it after success or after a form field is edited.
- Repeating the same request with the same date, trade, direction, worker
  count, notes and original actor returns the **original** event UUID,
  without creating a second `private.site_gate` log row.
- Reusing the UUID with changed details or a different actor fails.
- The existing row lock on the project protects the get-or-insert operation
  against concurrent requests, and the unique index is the final
  database-level guard.
- The existing append-only audit trail, manager reviews, current actual
  headcounts, and project-level permissions remain unchanged.
- Disposable SQL regression tests cover a replay, conflicting payload,
  and cross-staff replay.

## Limitations

This protects callers that provide a stable request ID. Legacy integrations
that omit it retain their previous behavior for compatibility; they should
migrate to the same idempotency contract. This does **not** establish
individual worker identity, attendance/payroll, check-in biometrics, or
a verified physical headcount beyond the watchman's recorded group events.

Do not merge/release until CI on this branch is green, the stacked PR chain
is reconciled, the correct Supabase staging environment is positively
identified, and mobile re-submission behavior has been manually tested.
