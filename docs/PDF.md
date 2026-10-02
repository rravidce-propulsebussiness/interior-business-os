# Quotation documents

## Phase 5 finance documents

The existing Chromium renderer also serves protected tax invoice, proforma, payment request, receipt and change-order PDFs. `packages/core/src/finance-document.ts` validates an allowlisted snapshot and escapes every value before rendering. Issued data is frozen independently of current catalog, tax and billing configuration. Public quotation tokens grant no finance access. Each finance preview/PDF route checks the relevant tenant permission and entitlement and returns private/no-store output.

Financial fixtures and browser tests exercise long specifications, repeated A4 table headings, page numbers and historical receipts. Poppler rasterization/text extraction is used for visual QA. Live hosted route acceptance still requires the deployed browser binary, Supabase session and signing configuration. See PHASE5-VERIFICATION.md for measured results and limitations.

One escaped HTML renderer consumes the customer-safe revision DTO for authenticated print preview and server-generated PDF. Playwright Chromium is already used by the repository; its runtime package is reused rather than adding a second PDF stack. Deployments must install the matching Chromium binary and support Node/browser processes. PDF routes use the Node runtime, authorize quotation.view and tenant ownership, and return private/no-store attachments. Phase 4 additionally exposes token-authorized delivery as described below.

Documents are A4 with sensible page breaks, room/area sections, optional items outside the main total, discount summary, branding and terms. Drafts are visibly labelled. Issued documents use only stored snapshots. Browser requests for external resources are blocked during generation; logos accept only bounded PNG/JPEG data URIs, preventing URL-based server-side fetching. Text and attributes are escaped, never interpreted as tenant HTML.

PDF tests cover customer-data exclusion, long specifications, multiple rooms/pages, discounts, optional items and historical values. Representative PDFs are rendered to images for visual inspection under the PDF skill workflow. No email, WhatsApp delivery or regulated electronic signature is implemented; Phase 4 commercial acknowledgements use the same customer document boundary.

Install the matching browser in the deployment image with `pnpm exec playwright install chromium` (Linux images also need Playwright's documented operating-system dependencies). The renderer limits concurrency to two browser instances per process, closes browsers in `finally`, blocks network requests, disables JavaScript and has a 30-second browser watchdog. Multi-instance deployments should also enforce request limits at the ingress. The HTML preview can be printed using the browser's Print command; the separate Download PDF link returns the generated attachment.

References: [Playwright page.pdf API](https://playwright.dev/docs/api/class-page#page-pdf), [Playwright browser installation](https://playwright.dev/docs/browsers).

## Phase 4 public delivery

A valid share token now authorizes /q/[token]/pdf on every request. The RPC resolves the exact revision and its customer-only projection before invoking the same renderer. Revoked/expired links, disabled downloads and cancelled quotations fail closed. No permanent public object URL is created. Historical superseded or commercially expired quotations can still be downloaded through a valid link; their contents remain the original snapshot.
