# Tax architecture

Tax codes are organization-owned ordered components with names and exact decimal percentage rates. Aggregate configured rate is limited to 100%. Invoice lines may select a code, or the document may apply one code to the aggregate post-discount amount. The chosen components and calculated amounts are snapshotted at invoice save/issue.

For exclusive tax, taxable basis is the post-discount amount. For inclusive tax, the unrounded basis is gross amount divided by one plus aggregate rate. Each component is rounded half-up at contract precision using PostgreSQL numeric. Exclusive total is basis plus the sum of rounded components; inclusive taxable amount is gross less that sum. Document-level calculation rounds once per component, while line-level calculation rounds each line's components. Consequently the modes can produce different totals; the UI explicitly selects the mode and scope.

Decimal text crosses JSON and rendering boundaries. Browser floating-point arithmetic is not used for authoritative totals. Tests cover inclusive/exclusive arithmetic, split components, line/document modes and frozen configuration after issue.

Optional HSN/SAC, billing state, place of supply and business/customer registration identifiers are display metadata. The demo seed provides CGST+SGST and IGST examples only. The system does not infer jurisdiction, validate GSTIN, choose place-of-supply rules, file returns, issue statutory e-invoices or guarantee Indian GST compliance. Tax-code configuration must reflect the business's applicable requirements. No tax is inferred for a receipt or a change-order delta.
