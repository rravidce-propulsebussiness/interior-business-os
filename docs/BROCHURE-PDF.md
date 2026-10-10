# Brochure PDF and print pipeline

The brochure still uses `packages/brochure-builder/src/render.ts` for its schema-validated, escaped HTML/CSS output. The Phase A0 renderer repair does **not** create a second brochure generator. A single provider-aware `renderPdf(..., { brochure: true, title, author })` uses Chromium on Node or managed Cloudflare Browser Rendering on Workers, without a text-only fallback. See [the PDF provider contract](PDF.md).

Print CSS uses `@page` to retain paper size, orientation, explicit bleed, forced per-sheet page breaks, page numbers, background assets, hyperlinks and draft watermarks. The documented formats remain A4, A4 landscape, A5 portrait/landscape, square and custom dimensions in millimetres. The secure Node Chromium adapter checks overflowing visible brochure text/table boxes before rendering, returning a `Print preflight` error rather than silently clipping copy.

Brochure input validation, image approval, geometry bounds, size limits and authorization continue to be enforced by existing model, print controllers and stored snapshot operations. Embedded image bytes are capped at 50 MB for the entire HTML document, and generated PDF bytes at 25 MB. Scripts and external resource fetches are forbidden. Missing images, text overflow, invalid layouts, and missing provider configuration must fail before publishing a new immutable brochure version. Publication/restoration/versioning must still use the existing database state machine.

**Cloudflare REST limitation:** local unit tests verify explicit request configuration and fail-closed behavior; they do not prove browser-executed preflight, exact page counts or provider network isolation. Real staging provider acceptance must verify these properties for every print format. Until verified, mark Cloudflare brochure publication **BLOCKED for production**.

The existing Playwright fixtures remain authoritative: interior profile, A4/A5 orientations, square, custom, 50-page print stress, metadata and annotated links. A matching local result is not a hosted result. No PDF/X or CMYK press certification is implied.
