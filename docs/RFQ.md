# Requests for quotation

Create an RFQ from an approved requisition. Select requested items and quantities, one or more active suppliers, delivery requirements and notes. Quantities cannot exceed their requisition item and must respect its explicit purchase increment.

Draft RFQs can be issued, then closed or cancelled subject to downstream responses. Issuing freezes requested items, supplier details, business/project information and delivery requirements. An RFQ invites prices; it does not reserve another copy of procurement demand.

Each supplier has a separate PDF projection. The document includes that supplier, business/project details, requested quantities and delivery information. It excludes internal estimate costs and profitability. No email is sent by the Issue action.

Enter supplier responses manually under the issued RFQ. Comparison displays recorded item rates, quantities, discounts, tax, freight, minimum order, validity and lead time. Suppliers are ordered by name; there is no recommendation, hidden score or automatic selection.

`rfq.view`, `rfq.create` and `rfq.manage` are separate grants, gated by Projects and Purchasing. Supplier selection additionally checks vendor visibility. Vendor quote access adds Vendors entitlement and quote-specific grants.
