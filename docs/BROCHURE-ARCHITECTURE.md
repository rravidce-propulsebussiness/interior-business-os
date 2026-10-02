# Phase 9 brochure architecture

Brochure is an independent optional module. Business App owns authoring; Websites hosts platform-path public delivery without a Website record, entitlement or domain. Platform Admin manages brochure capabilities and suspension. No Phase 10 features are introduced.

The brochure-builder package owns a strict versioned fixed-page document, components, print styles, editing operations and an escaped renderer. Positions and sizes use millimetres; print preflight rejects out-of-bounds and overflowing text before publication. The editor supplies visual and numeric controls. Templates contain ordinary editable document data.

Organizations remain the canonical business identity. A reusable organization marketing kit stores only approved public presentation fields, brand settings, content and saved blocks absent from the existing identity schema. Catalog/project imports require their original source permissions and copy allowlisted fields for explicit public approval. Publication resolves kit bindings into a stable snapshot. Published versions and their PDFs are immutable; restore creates another version.

The existing private media byte store and website_assets metadata are extended for organization-owned marketing assets. Brochure asset references retain historical bytes and prevent unsafe deletion. Existing website-owned assets require source website authorization before reuse. Brochure media and public delivery do not require Website entitlement. The legacy storage table name is an implementation detail.

Publishing first validates and renders a PDF on the trusted server, then submits a short-lived signed digest of the exact document and PDF to one organization-locked RPC. That transaction rechecks permissions, entitlements, draft version, reference ownership and historical restore identity, inserts the immutable version/PDF and changes the public pointer atomically. Failed preflight creates no publication. Draft exports are separately authorized and never publicly cached.

Public readers resolve organization slug plus brochure slug to a current approved snapshot. Status, entitlement and sharing capability are checked on every viewer, asset, PDF and enquiry request. Stable PDF bytes are stored at publication; authorization is never inferred from cache. Public forms reuse normalized canonical CRM leads, explicit consent, duplicate detection, honeypot and transactional limits. Attribution records the brochure, sequence, page and CTA without exposing private records to the visitor.

Checked RPCs and forced tenant RLS enforce granular permissions. Website Developer receives no brochure grants. Brochure Designer is a separate configurable role. Platform authority does not grant content editing. All public output is structured and escaped; custom blocks do not execute HTML, CSS or JavaScript.
