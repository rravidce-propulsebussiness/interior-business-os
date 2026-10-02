# Quotation snapshots

Snapshot schema version 1 wraps the unchanged Phase 2 calculationVersion and its serialized output. Each line preserves identity/key/category, measurements, specifications/options, unit/book/rate/modifiers, rounding, minimum metadata, original amount, optional override/reason, discount and final amount. Internal cost is stored separately under quotation.view_internal_cost RLS. Customer-visible specifications are a separate allowlisted projection derived from visibleCustomer flags, not a browser-supplied object.

Revision content snapshots seller branding/contact/address, customer identity/address, project/site, terms, validity and document display flags. Line area names/order are copied. Changing masters cannot alter an issued revision. Cloning copies these exact values and stable line lineage IDs into a new draft. Explicit repricing uses current masters for only that line; no background bulk refresh occurs.

Signed persistence authenticates server-generated snapshots. Database triggers reject changes to frozen revision content and to its lines/internal rows, even through a privileged maintenance statement without an allowed lifecycle transition. Database totals checks validate arithmetic consistency while the canonical TypeScript engine remains the only catalog pricing implementation.

Historical deserialization checks the snapshot schema version and decimal representations; the engine version is retained in the saved calculation. Future versions must add explicit readers rather than reprice historical snapshots. Customer rendering builds a fresh public DTO; it cannot forward internal notes, costs, contribution, minimum rates, modifier logic, audit data or arbitrary metadata.
