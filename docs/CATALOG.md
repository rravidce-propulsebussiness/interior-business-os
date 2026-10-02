# Catalog architecture (Phase 2)

Extend the existing database, auth, UI and quotation-engine packages. Tenant-owned categories, items, attributes, options, price books, effective rates and modifiers use organization IDs and composite foreign keys. Units and measurement methods are global immutable reference catalogs, not tenant pricing. Industry starter data is copied into tenant configuration; businesses never share mutable catalogs.

Use existing active-membership, granular permission and entitlement predicates. Catalog reads/writes require catalog.view/manage and catalog entitlement. Pricing reads/writes additionally require pricing.view/manage and pricing entitlement. Internal costs have a separate table and require quotation.view_internal_cost; neither ordinary catalog JSON nor selling-rate rows contain costs. Platform roles confer no tenant access.

Preserve RPC-only mutation conventions. A bounded entity allowlist supports normalized configuration editing with optimistic versions; no arbitrary relation, column, SQL or executable formula is accepted. Organization locks serialize configuration mutations and database validation rejects cross-item references, category/dependency cycles, overlapping rates and invalid default books. All new public tables force RLS. Sensitive changes append to the existing audit log in the transaction.

The initial administration surface is organization-wide. Branch-specific price books can be configured by organization administrators and used in explicit branch previews. Branch-only employees do not acquire organization-wide catalog management authority.

See PRICING-ENGINE.md for deterministic calculations, historical snapshots and rounding. No quotations, customers, BOQ or execution records are created in this phase.

## Administration workflow

Open Catalog from the Business dashboard. Add a category and an item with stable keys, industry/category references, unit, measurement method and rounding rules. The item page has progressive sections for settings, questions/options, rates/modifiers and preview. Configure a question's input type, required/visibility flags, pricing flag, order and help text; add options; then choose optional defaults and visibility conditions. Conditions use same-item parent options and can be combined with AND. Select/multi-select options drive modifiers; boolean, number and text answers are specifications in this phase, not arbitrary pricing scripts.

Add an item default rate (no book selected) or a book-specific rate. Every rate has explicit currency and ISO effective dates. Add estimated cost separately when authorized. Pricing lists books and rate history; replacing an open rate requires its current version and a later effective start, closes the old window and creates a successor. Add a new cost row for the successor if needed. Deactivation/reactivation is explicit and version-checked. Stale updates fail rather than overwriting newer changes; reload before editing again.

Preview uses saved configuration and explicit dimensions, date, currency, branch and optional book. It displays quantities, rates, modifiers, minimum warning, rounding and authorized cost information. Downloading the JSON captures that calculation; subsequent master edits do not change the downloaded data. No quotation is persisted. Hidden stale answers do not affect pricing. Units/methods are reference definitions displayed read-only; new safe methods require a reviewed engine extension, never stored JavaScript.

The Interior development seed defines five categories, seven items, a Standard book, seven item default rates, one internal cost and five Wardrobe questions with thirteen options/modifiers. It is generated from packages/industry-interior/src/starter.json and is opt-in after the existing demo-user seed. Reruns insert missing fixture IDs and never overwrite an organization's edited masters. A conflicting active default must be resolved deliberately rather than silently replaced.
