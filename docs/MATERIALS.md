# Materials and planning costs

Materials belong to an organization and are separate from finished-work quotation catalog items. Categories classify materials; variants hold configurable attributes, including dimensions and finish. Brand and manufacturer names are ordinary data.

Open **Project → Execution → Materials**. Create a category, material and variant, then add an explicit conversion. A conversion records purchase unit, consumption unit, consumption per purchase unit, purchase increment and a source/reason. For example, one sheet can represent 32 sqft with an increment of one sheet. Changing a conversion creates a new row; previous calculation snapshots retain the old conversion.

Materials, variants and categories can be edited or deactivated. Referenced records are not hard-deleted. Active recipes and new estimates must select active variants with an explicit conversion. Safe rule bases include fixed quantity, finished quantity/area, dimensions, volume and percentage; no executable expressions are stored.

Cost History stores a decimal rate, currency, effective interval and source. Optional vendor-specific rates require a vendor/material mapping. A successor closes the old interval and creates a new rate; overlapping intervals are rejected. Dates are finite and the end date is exclusive. Rate selection does not perform implicit currency conversion.

`material.view` and `material.manage` govern quantities/configuration. `material_cost.view` and `material_cost.manage` govern the separate rate table. Projects entitlement is required; vendor-specific configuration also checks Vendors access. Site and Designer templates do not receive material cost access.

The optional `supabase/seed-execution.sql` adds illustrative plywood, laminate, hinges, drawer channels, adhesive, edge band, three suppliers and a wardrobe recipe with a finishing service. Its rates are demonstration assumptions, not current market quotes. It creates no contracts, approvals, purchases or stock.
