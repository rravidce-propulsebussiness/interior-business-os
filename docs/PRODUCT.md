# Business Operating System

A modular multi-tenant SaaS product. Interior Design is the first industry pack; Construction and other packs must reuse the same core.

Platform Admin manages organizations, verification, subscriptions, plans, offers, modules, industry packs, feature flags, platform settings and aggregate analytics. Business Admin manages employees, configurable roles, branches, customers, CRM, catalogs, prices, quotations, projects, billing, brochures and optional websites within its own organization.

Website is optional: CRM, quotations and billing must work without it. Website, Brochure and Client Portal have separate entitlements. Subscription packaging is configuration, not application branching.

Quotation prices finished work plus specifications. A wardrobe may use width × height. Supported future quantity methods: square foot, square metre, running foot, cubic foot/metre, each, point, room, day, lump sum, percentage, package and sandboxed custom formulas. Businesses configure base selling rate, minimum selling rate, internal estimated cost, required questions, dropdown options, pricing modifiers and customer-visible specifications. Modifiers support fixed amounts, per-unit amounts and percentages, with explicit ordering and basis.

Interior examples include plywood type/brand/grade, internal and external finishes, hardware, shutter type and handles. Construction examples include concrete grade, steel grade, location and shuttering inclusion. These are generic catalog attributes and options, never dedicated core columns.

Exact plywood-sheet consumption is not a sales quotation calculation. Detailed BOQ, material estimation, purchases and actual consumption belong to project execution after approval. Approved quotations preserve an immutable pricing/specification snapshot.

Phase 0 delivers architecture, standards, workspace configuration and runnable application shells only. No CRM, billing, quotation screens, website builder or project management is implemented.

Phase 3 implements customer masters, commercial project containers and quotation revisions, with customer-safe print/PDF output. It does not introduce CRM pipeline, execution tasks, material BOQ, billing, sending or customer approval. See PHASE3-VERIFICATION.md for local evidence and the remaining hosted acceptance requirements.
