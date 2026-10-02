# Procurement workflow

Accepted contract and approved changes → execution scope → approved estimate → requisition → RFQ → recorded vendor quotes → split purchase orders → goods/service receipts.

A requisition selects approved estimate lines. Compatible material/unit or service requirements consolidate while preserving source allocations. Active requisitions reserve demand; cancelling a requisition releases its allowance only when downstream procurement is resolved. Current approved estimates and commercial scope are checked before new commitments.

RFQs can invite multiple vendors without multiplying demand. Users compare recorded facts and choose awards. PO issue reserves committed quantities under the organization lock, so competing drafts and repeated submissions cannot over-order. Receipts use the same lock to prevent over-receiving.

The source chain remains queryable through record links: PO item → quote item → RFQ item → requisition item → source allocation → estimate line → commercial scope. Consolidated ordered quantities shown per source line are proportional attributions, not separate physical deliveries.

## Cost terminology

- **Estimated:** planning cost of the current approved estimate, with material/labour/service classifications. Missing cost bases are not silently zero; approval requires a cost basis for every active line.
- **Committed:** issued, partially received, received and closed PO amounts, including their allocated tax and freight. Draft/cancelled POs are excluded.
- **Received:** proportional PO value of accepted quantities. Rejected quantities are excluded from this value.
- **Estimated contribution:** current commercial value minus estimated execution cost, available only with commercial access and Billing entitlement.

These measures are not inventory valuation, consumed-material cost, accounting expense or final profit. Planning rates and PO values can have different tax/freight bases; the dashboard explains that distinction. Currencies are not combined or automatically converted.

## Security and limits

All execution/procurement tables carry organization identity, forced RLS, checked foreign keys and server-authorized RPC mutations. Internal rate, estimate-cost, PO-cost and estimate-document records are separately protected. Branch-only grants do not authorize organization-wide procurement.

Payloads, lines, recipients and query pages have explicit bounds. General lists use 25-row pages; configuration selectors load a bounded set of named records. PDF rendering disables script execution and external requests and limits concurrent renders. Public quotation/customer routes do not consume execution data.

There is no inventory ledger, stock transfer, consumption tracking, project scheduling, payroll, accounting recognition, automated vendor selection or external email in this phase.
