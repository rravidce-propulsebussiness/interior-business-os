# Payment schedules and requests

Draft schedules contain ordered percentage, fixed or remaining-balance milestones, descriptions, due triggers and optional dates. PostgreSQL calculates amounts from the frozen calculation basis and contract precision. Percentage totals above 100, aggregate over-allocation and remaining-balance lines before the last position fail. Under-allocation is permitted and exposed as schedule unallocated. Zero-value milestones do not imply a cash receipt.

Activation freezes the schedule and every line. The basis must still equal current contract value. Active schedules are additive: an approved increase can be covered by a new schedule, whose remaining-balance line deducts amounts already scheduled. Settled milestones are never recalculated.

A draft may name a superseded schedule. Activation replaces that schedule only if none of its items has ever been referenced by a request or invoice. This intentionally conservative rule preserves billed and requested history, even after document voiding. Deductions expose negative schedule-unallocated balance until eligible future schedules are replaced. Partial replacement of an already referenced schedule is not supported.

Issuing a payment request marks a milestone ready for collection. Requests snapshot the expected amount and customer-facing header, due date and note; they are not invoices or receipts. Duplicate live requests return the existing request. Voiding requires a reason and retains history. Paid/partial/overdue status is derived from invoice allocations against the milestone; direct payment recording without an invoice remains an advance. A request never creates an allocation automatically.

All operations enforce Billing, granular schedule/request permissions and tenant-qualified references. List and detail queries are bounded; monetary values remain strings through UI and RPC boundaries.
