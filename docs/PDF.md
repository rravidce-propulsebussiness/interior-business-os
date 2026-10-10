# Production PDF rendering — Phase A0 provider contracts

The previous text-only `pdf-lib` fallback was incompatible with the quotation, finance, brochure and report print requirements. `packages/shared/src/pdf.ts` now dispatches to explicit rich-PDF adapters, retaining existing permission-gated controllers and immutable stored snapshots.

## Providers and configuration

| Host | `PDF_RENDERER` | Runtime backend | Required configuration |
| --- | --- | --- | --- |
| Standard Node 24 (Hostinger/VPS/staging) | `node` (default outside Workers) | `packages/shared/src/pdf.node.ts`: restricted Playwright Chromium | Install matching Chromium with `pnpm exec playwright install --with-deps chromium`; Node must be allowed to spawn browser processes |
| Cloudflare Workers/OpenNext | `cloudflare-rest` (explicit in `apps/business-app/wrangler.jsonc`) | Cloudflare Browser Rendering REST `POST /accounts/{id}/browser-rendering/pdf` with server-supplied HTML | Secret `CF_BROWSER_API_TOKEN` with Browser Rendering Write and non-secret `CF_BROWSER_ACCOUNT_ID` (32 hex chars), provisioned per environment |

**Neither `nodejs_compat` nor OpenNext provides a local Chromium process in Workers.** A missing/invalid provider is a `PDF_RENDERER_UNAVAILABLE` 503, not a degraded text document. Node launch failures and remote rendering failures also fail closed (no silent fallback). Never put Browser Rendering tokens into `NEXT_PUBLIC_*`, HTML, checked-in Wrangler vars or code. The Worker must have outbound access to the official Cloudflare API. The REST API supports supplied HTML, PDF options, `setJavaScriptEnabled`, request-blocking patterns and preferred CSS page sizes: https://developers.cloudflare.com/api/resources/browser_rendering/subresources/pdf/methods/create/.

On **Node**, Playwright launches a fresh isolated context per request with JavaScript and service workers disabled, aborts all network requests, uses `page.setContent` and prints with `page.pdf({ preferCSSPageSize: true, printBackground: true })`. It closes browser/context in `finally` and enforces a rendering watchdog. Browser startup requires a real Chromium binary; Node packages alone are insufficient.

On **Workers**, the Browser Rendering REST adapter sends only pre-validated HTML; `setJavaScriptEnabled=false`, rejects external URL schemes/resources, uses `preferCSSPageSize`, blocks redirects and applies a 30-second abort. It rejects non-PDF provider responses. Provider correctness, billing/quota, remote network interception and end-to-end PDF fidelity **remain hosted acceptance requirements**; local mocks are not certification of the Cloudflare service.

## Document integrity and security

- Existing private quotation/finance/project endpoints check authenticated tenant membership, permission, entitlement, record ownership and revision before generating PDF bytes. Public `/q/[token]/pdf` uses the existing limited sharing-token resolver. No service-role bypass.
- All documents must be constructed from escaped, allowlisted canonical snapshots; internal costs and private fields must never enter public projections.
- `validatePrintHtml` rejects scripts, frames, embedded active content, external images/styles and unsafe hyperlinks; permits bounded embedded PNG/JPEG/WebP assets and a tight print-time CSP. Node additionally aborts **all** resource fetches. Cloudflare REST disallows remote patterns and scripts; verify this on the real provider.
- HTML is capped at 80 MB, embedded media at 50 MB, generated PDFs at 25 MB, and concurrent jobs at two per process. These are process limits, not a distributed quota: ingress rate limiting and provider quota are required at hosting.
- CSS `@page` determines portrait/landscape/custom dimensions, with table headers and forced page breaks retained. Approved links remain clickable in PDFs but cannot be fetched while rendering.
- `PdfServiceError` exposes a generic no-store HTTP 503 for unprovisioned providers. Non-503 authorization errors remain restricted to their original handler. Do not log HTML, provider credentials, PDFs or customer data.
- Existing historical issued PDF bytes must be served unchanged. Generation of new snapshots must fail before mutation if rendering/preflight fails.

## Operational verification and release status

Run `pnpm install --frozen-lockfile`, `pnpm security:dependency`, `pnpm audit --prod --audit-level=high`, `pnpm check`, disposable `pnpm db:verify` (never against hosted DB), and the Cloudflare deployment build. The rich-PDF Playwright tests are mandatory; do not lower page-count/dimension/layout assertions.

In staging: generate authorized quotation/invoice/report/brochure and anonymous-denied PDF, test revocation and immutable issued snapshots, inspect PDF annotations, dimensions and metadata, verify no outgoing browser network request, test missing Browser Rendering token produces 503 with no file, and inspect provider limits. Cloudflare remote acceptance cannot be inferred from Node CI and remains **BLOCKED** until token, staging Worker and real browser-rendering service are provisioned.

Hosted production release remains **NO-GO** until these and the independent `docs/PRODUCTION-GO-NOGO.md` gates are explicitly accepted.
