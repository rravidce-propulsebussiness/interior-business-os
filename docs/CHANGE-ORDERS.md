# Change orders

Changes have draft, issued, approved, rejected and cancelled states. Drafts may be edited with optimistic version checks. Issuing snapshots previous/current proposed contract values and customer-visible scope; approval requires explicit customer approval evidence recorded by authorized staff. Issue/approval retries apply once, and competing approvals against the same previous value serialize: the later stale change must be cancelled and freshly issued. No new public approval-token mechanism is introduced.

Addition contributes the new scope amount. Deletion subtracts the original accepted line amount, including its proportional share of revision discount and final-line rounding residual. Modification stores original amount and new amount and contributes only their difference. Authorized signed price adjustments require a reason. A change cannot make the contract negative. Original quotation and contract baseline remain immutable.

Catalog additions/modifications use the existing canonical quotation engine. The server obtains current catalog configuration and fingerprint, overrides organization/branch/currency/time, clears hidden rate overrides and discounts, computes the snapshot and signs the command. PostgreSQL checks the authenticated actor, permission/entitlements, HMAC namespace, nonce, expiry and current fingerprint before accepting it. The browser's preview is not authoritative. Manual new-price lines require `change_order.manual`.

An original accepted item can be changed by one approved change order; subsequent changes use a reasoned explicit price adjustment. Approved changes cannot be edited or deleted. Issued rejected/cancelled records remain. Original accepted value never uses a current rate lookup.

Manual draft editing restores quantities/rates/specifications from its stored new snapshot. A catalog-priced draft is replaced by cancelling it and creating a fresh catalog change, rather than silently converting it to manual pricing. The catalog workflow currently creates one priced line per change; manual changes support multiple lines.

Approved deltas immediately affect current contract value, unbilled value and schedule discrepancy. They do not rewrite invoices, receipts or activated milestones. See PAYMENT-SCHEDULES.md for additive schedules and conservative supersession rules. Negative deltas do not automatically refund or credit previously invoiced amounts; credit notes/refunds are deferred.
