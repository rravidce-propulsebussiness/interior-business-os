# Vendors

Open **Execution → Vendors** to maintain supplier names, legal/contact details, addresses, tax identifiers, terms and status. Contacts and material mappings are separate records. Mappings record supplier descriptions, lead time, minimum order, pack quantity and preferred-supplier designation.

Vendor administration requires `vendor.manage`, Projects and Vendors entitlements. Vendor quote actions additionally require Purchasing. A preferred supplier is a stored preference; comparison does not turn it into a score, ranking or automatic award.

RFQs snapshot the selected supplier details. Recorded quotes retain manually entered rates, discounts, configured tax components, freight, lead times, validity and terms. Expired quotes remain visible in comparison; they cannot authorize a new PO issue. Quote currency must match the contract.

Draft quotes use optimistic versions. Two writers using the same version cannot overwrite each other. Recording freezes the response; a correction requires another response or cancellation before downstream orders exist. Cancellation does not delete history.

Site, Designer, Sales and customer/public surfaces cannot retrieve vendor prices through quote tables, cost tables, document routes or execution APIs. This phase does not send emails, expose a supplier portal or upload supplier attachments. External references are text only.
