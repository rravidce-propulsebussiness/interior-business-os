# Contracts

An approved response to an issued quotation revision is the only handoff source. `contract_create` checks quotation response visibility, project access, `contract.create`, Billing and Projects. The quotation page exposes Create Contract / Start Job after approval, or the existing contract on repeat visits. The database unique organization/revision constraint and organization lock make concurrent retries return one contract.

Contracts retain customer, project, originating lead, branch, currency, acceptance reference, original value and an allowlisted source snapshot. Accepted scope never uses current catalog prices. Precision is frozen at at least two decimals, increased to preserve accepted values up to six decimals. Amounts are decimal strings; the database uses numeric arithmetic.

Numbers use the configured prefix (CT by default), organization-local calendar year and an organization/document/year counter. Numbers are never reused after cancellation. Pending contracts may become active or cancelled; active contracts may be held, completed or cancelled; held contracts may resume or cancel; completed contracts may resume or close. Stale versions fail. Reasons are mandatory for hold, cancellation and closure. Cancellation cannot discard issued invoices, recorded payments, approved changes or issued requests.

Original value is immutable. Current value is original value plus approved change-order deltas. Closure requires fully invoiced current value, fully allocated payments, paid tax invoices, no draft invoices and no unresolved changes. A closed contract rejects new commercial writes. Completion alone is not financial settlement.

The contract detail contains permission-filtered schedules, invoices, payments, receipts, changes and audit timeline. Customer account statements group totals by currency; customer and project pages link into commercial records. No execution tasks, procurement, BOQ or material consumption are introduced.
