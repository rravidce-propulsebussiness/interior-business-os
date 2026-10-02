# Offline payments and receipts

Supported method kinds are bank transfer, UPI, cash, cheque, offline card and other. The organization enables named methods. Recording requires a positive exact amount at contract precision, a received date no later than the organization's current date, an enabled method and an idempotency UUID. Reusing the key with an identical payload returns the original payment; a different payload fails.

Recording payment, initial allocations, receipt numbering, snapshot and audit events is one database transaction. An invalid allocation rolls everything back. Organization locking serializes competing writes. One payment may allocate across multiple issued tax invoices on the same contract and currency. Each allocation has its own idempotency key. Neither the available payment amount nor an invoice's outstanding balance may be exceeded. Proformas cannot receive allocations.

An unallocated payment is an advance, not invoice settlement. Later allocation consumes available advance without issuing a second receipt. Summary reports show receipts collected, invoice balances and unallocated advances separately, grouped by currency. There is no automatic cross-contract allocation or currency conversion.

The receipt snapshots original customer/business details, method name, reference, received amount and allocations at recording. Subsequent allocation appears in the account statement; the original receipt does not change. Voiding a payment requires an explicit reason, reverses its active allocations with timestamps/actor/reason, marks the associated receipt void and preserves all rows. Closed contracts cannot be voided. No cash refund is implied.

Customer account statements are available from customer details under the financial-report grant. Tabs expose only independently authorized contracts, invoices, payments, allocations, receipts and changes. Current summaries and historical receipt documents serve different purposes.
