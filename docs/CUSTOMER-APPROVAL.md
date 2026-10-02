# Customer quotation responses

Design recorded before implementation. Customer responses are append-only records separate from immutable issued revision contents. A response records action, customer-entered name, comment, acknowledgement, timestamp, exact revision/share context and the accepted snapshot amount. The server determines amount and revision; neither can be supplied by the customer.

One decisive response per revision is allowed. Retrying the same response is idempotent; a conflicting response is rejected. A change request leads the salesperson to the existing clone/revise/issue workflow. Approval, revocation and superseding serialize on the same organization lock, then recheck current status and commercial validity. Valid-until is interpreted through the organization's timezone, inclusive of that local date.

Approval creates a separate commercially accepted read model for the quotation/project and an automatic lead timeline event. It does not alter frozen content, create invoices or launch execution. A newer issue supersedes the commercial state of the former revision; historic acceptance evidence remains. Leads move Won explicitly with permission, not merely on issue. Decline does not silently mark Lost.

Optional items remain read-only and excluded from accepted amount in Phase 4. Customers request a new revision to include them. Confirmation wording is a commercial acknowledgement, not a claim of regulated electronic-signature compliance.
