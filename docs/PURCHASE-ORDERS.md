# Purchase orders and receiving

From a recorded vendor quote, select items and quantities to award. Different suppliers or partial quantities produce separate POs. Every item retains its quote item, RFQ item, requisition item and estimate-source chain.

Draft orders do not reserve demand. Issue locks the organization, checks the expected version, supplier status, quote validity, approved requisition, remaining quote quantities and current approved estimate demand. A competing draft cannot issue after another order consumes the allowance. An old requisition cannot bypass a later approved reduction or removed commercial scope.

Quote discounts, tax and freight are allocated using exact PostgreSQL numeric arithmetic at contract currency precision. Cumulative allocations subtract costs already committed by active awards, preserving the remaining minor units when an earlier award is cancelled and replaced. Draft cost previews are recalculated at issue.

Issued PO content and its priced PDF snapshot are immutable. Quantity records and internal cost records live in separate tables. Site can read ordered quantities but cannot retrieve prices or the priced PO document. Supplier/business changes do not rewrite issued documents.

Unreceived draft/issued orders may be cancelled with a reason. Orders with receipts cannot be cancelled. Fully received orders can be closed with a reason. This implementation does not silently short-close an outstanding quantity; partial closure/returns require a separately scoped workflow.

Record goods or services against an open issued PO. The screen shows ordered, previously received, accepted, rejected and remaining quantities. Each receipt must satisfy **received = accepted + rejected**, and cumulative receipts cannot exceed ordered quantity. Rejections require a reason. Services use their configured quantity unit and can be fractional.

Receipts are append-only and payload-bound retry keys prevent duplicate recording. Rejected quantities consume the received allowance; they do not automatically create replacement orders or stock movements. A fully received PO may therefore include rejected quantities. The receipt PDF preserves ordered, received, accepted and rejected quantities without prices.

Permissions separate PO creation, issue, management, quantity visibility, cost visibility and receiving. Projects and Purchasing entitlements are required. All writes use the existing organization lock and audit infrastructure.
