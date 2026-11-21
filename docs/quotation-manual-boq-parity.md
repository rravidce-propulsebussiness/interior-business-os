# Quotation specifications → drawing-based manual BOQ parity

The construction quotation and BOQ are different financial views:

- **Quotation** records customer-selling rates, floor-to-floor heights, approved slab thickness, scope and maximum package allowances.
- **BOQ** records measured material/labour quantities and estimated supplier/trade costs. An allowance quoted at ₹X per unit is a customer-facing _limit_, **not** an automatic material purchase price.
- **Contract billable floor area** is not assumed to equal the total structural slab casting area. Record each basis separately.

## Manual drawing entry in the existing BOQ screen

1. Finalize the floor-by-floor quotation. Each floor should have length, width, actual floor-to-floor height and pricing rate. Enter the slab thickness from the approved structural design.
2. For every allowance specify: title, included / allowance / extra / excluded, unit (door, bathroom, sqft, running ft, etc.), value and make/grade. Separate categories where prices differ; for example room/bathroom/parking tile limits, and floor-specific main-door prices.
3. Open **BOQ & Estimating** for the project; the Final linked quotation is selected automatically. Record actual door counts, bathroom/kitchen counts, room sizes, window sizes (number × width × height), kitchen platform lengths and railing running feet by floor.
4. Enter the drawing's **column groups** (count of identical columns, section dimensions, steel count × diameter, stirrup spacing, footing and level coverage), **beam groups** (bar combinations, section and running lengths), and drawing overrides. Do not rely on inferred generic grid quantities when an approved schedule exists.
5. Generate or regenerate the BOQ using the **quotation-driven takeoff**. This is the same calculator whether the drawing schedule was typed manually or programmatically supplied. Manual _additional template lines_ use their own generic calculators and should be reconciled independently; they are **not** asserted to be identical to the quotation generator.
6. Review stage totals; check counted quantities, units, wastage, bar lengths and supplier rates. Edited quantities and rates survive regeneration. Confirm all provisional dimensions and measurements with site engineer before using the result for procurement.
7. Reconcile each required output against the project’s existing reference BOQ (line, stage, unit, quantity and cost) before marking final. Different source quotation versions or manually edited rate cards are legitimate differences, not automatic matches.

### Data guardrails

- Blank railing price remains blank; no value may be invented from an unspecified inclusion.
- Do not substitute a quote’s package allowance for actual procurement cost.
- Source drawings may contain inconsistent labels (e.g. G+6 reinforcement header on a G+3 + penthouse project); escalate to engineer for sign-off.
- Customer files and contract identities must **not** be committed to the application source repository.
