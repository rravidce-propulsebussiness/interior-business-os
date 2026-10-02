# Phase 8 website architecture

The optional Website module extends the existing three applications. Business App owns authoring; Websites resolves a verified hostname to an immutable published snapshot; Platform Admin owns capabilities, limits, domain configuration and suspension. CRM, finance and execution do not depend on Website. Brochure remains independent.

The website-builder package owns a versioned structured page tree, component registry, responsive styles, design tokens, navigation, forms, public bindings and pure validation/rendering. Templates are editable initial trees. The builder supplies a component palette, canvas, property inspector, keyboard reordering, nested moves, duplication and local undo/redo. Draft writes use optimistic concurrency; publish and restore serialize on the existing organization lock. Restore creates a new version.

Website-specific membership scopes narrow existing granular organization permissions. Website Developer receives website permissions only and must be assigned to a website. Owners with website scope-management permission can manage assignments. New tenant records force RLS; narrow RPCs perform mutations. Public RPCs never return organization records, drafts, private canonical entities or internal identifiers unrelated to rendering.

Capability configuration uses the existing module/plan/entitlement architecture, without plan-name branches. DNS verification is performed on the server against a random TXT challenge; the database accepts a signed attestation, not a browser claim. DNS verification and TLS readiness are separate. A configured hosting adapter is required to activate custom HTTPS domains; unconfigured deployment integrations fail closed.

Custom code is frontend-only. Syntax and capability checks run without executing source. Compiled artifacts are immutable snapshot data. Code renders in an opaque-origin sandboxed iframe without same-origin, navigation, popup, form or storage privileges; restrictive CSP blocks arbitrary network access. Preview never injects tenant HTML, CSS or JavaScript into the Business App document. The sandbox SDK receives only the published public projection. Validation is defense in depth; the iframe and server authorization are the security boundaries. No arbitrary dependencies or server code are accepted.

Public lead submission resolves the current published hostname/page/form, validates configured fields and consent, normalizes phone numbers using the existing CRM helper, rate-limits transactionally, detects duplicates and appends canonical CRM lead activity. No parallel website-lead master is introduced.

Published versions are immutable and keyed for caching. Host resolution and suspension/entitlement checks remain current; a cached version never authorizes a hostname. Draft preview is authenticated and no-store/noindex. Media is tenant-owned and publicly available only through explicit published references. SEO, sitemap, robots and public data bindings derive from the same published projection.

Sandbox reference: [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox) and [CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox). Hosted Auth, storage, DNS and certificate acceptance are reported separately from local tests.
