# Phase 8 website implementation and verification

Local verification completed on 2026-10-02. Hosted Supabase, authenticated builder acceptance, live DNS and certificate acceptance remain outstanding. This report does not certify deployment readiness. No Phase 9 work is included.

## Architecture and authoring

| Requested report item   | Implementation                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Website architecture | Business App owns authoring, Websites serves published snapshots, and Platform Admin controls platform configuration. The website-builder package owns structured models, editing, validation, compilation and rendering. |
| 2. Optionality          | Website uses the existing optional module entitlement. CRM and operational modules do not require it. Brochure remains separate.                                                                                          |
| 3. Business Admin       | Pages, nested components, responsive styles, tokens, navigation, content, forms, media, SEO, domains, team, versions and permitted developer source.                                                                      |
| 4. Platform Admin       | Plan limits, component availability, embed configuration, base domain/TLS configuration and suspension; platform access does not grant tenant content authoring.                                                          |
| 5. Website Developer    | Dedicated website permissions plus explicit website assignment. Assigning the role does not remove other pre-existing roles.                                                                                              |
| 6. Permissions          | Separate view/manage/scope, page lifecycle, theme, media, SEO, navigation, domains, custom CSS/code, forms and integrations permissions.                                                                                  |
| 7. Entitlements         | Existing Website module and configurable site/page/storage limits, forms, custom domain, code, developer mode, analytics and integrations capabilities; no plan-name branches.                                            |
| 8. Page schema          | Versioned structured document with independent pages, normalized routes, nested nodes, settings and references. Duplicate/reserved routes and invalid references fail validation.                                         |
| 9. Components           | Generic component registry, nested insertion/moves, duplication/deletion, saved sections and editable Interior starter trees. Templates are starting points.                                                              |
| 10. Design tokens       | Shared theme values and component styles are document configuration.                                                                                                                                                      |
| 11. Responsive system   | Desktop/tablet/mobile overrides and preview sizes. Keyboard move controls accompany drag interactions. Local undo/redo retains 50 edits.                                                                                  |
| 12. Dynamic data        | Explicitly published content bindings. Authorized catalog/project imports copy allowlisted title/description for review; private canonical records are not queried publicly.                                              |
| 13. Forms               | Structured labelled fields, required/optional controls, consent, configured CRM mappings and confirmation messages.                                                                                                       |
| 14. CRM integration     | Current published form resolves to canonical CRM leads and lead activity, with phone normalization, duplicate detection, honeypot and transactional quota. Requires CRM entitlement and an open pipeline stage.           |
| 15. Versioning          | Optimistic draft concurrency and immutable published snapshots.                                                                                                                                                           |
| 16. Preview             | Authenticated draft rendering, noindex, disabled enquiries and selection messaging from the preview frame.                                                                                                                |
| 17. Publishing          | Explicit saved-draft publication with validation, permission/capability checks and signed build attestation.                                                                                                              |
| 18. Rollback            | Restore creates a new immutable version and preserves history.                                                                                                                                                            |

## Public delivery and security

| Requested report item | Implementation                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19. Public renderer   | Current hostname authorization precedes a bounded cache keyed by hostname and immutable version. Unknown hosts/pages return 404; unconfigured local installs retain the foundation shell.                                   |
| 20. Domains           | Unique live hostname claims, managed subdomains and custom domains with distinct verification, activation, removal and suspension states.                                                                                   |
| 21. DNS verification  | Server TXT challenge and destination address checks, private-address rejection and short-lived signed attestations bound to the domain/challenge.                                                                           |
| 22. SSL               | Pinned TLS certificate verification; the hosting platform must provision certificates and wildcard routing. Automatic certificate issuance is not implemented.                                                              |
| 23. SEO               | Page/global metadata, canonical and Open Graph fields, noindex and escaped Organization JSON-LD.                                                                                                                            |
| 24. Sitemap           | Published paths and resolving hostname only; robots respects noindex.                                                                                                                                                       |
| 25. Media             | Tenant-scoped authenticated uploads, image normalization, bounded PDF/MP4 files, private database byte storage and current-publication reference checks. Historical references retain assets.                               |
| 26. Custom CSS        | Parsed and capability/permission gated; imports and unsafe resources rejected.                                                                                                                                              |
| 27. Custom HTML       | Parsed tag/attribute allowlist and isolated component rendering.                                                                                                                                                            |
| 28. Developer Mode    | Frontend source editing, static validation, preview, publish and version restore. No server code, arbitrary dependencies or runtime source evaluation on the server.                                                        |
| 29. Isolation         | Opaque-origin sandbox iframe, restrictive inner CSP, no same-origin or navigation privileges. Static analysis is defense in depth, not an execution-time guarantee.                                                         |
| 30. Public SDK        | Snapshot-only business profile, services, projects, testimonials and FAQs. No authenticated database client or private records. Native forms handle enquiries.                                                              |
| 31. Headers           | CSP, nosniff, frame denial and Permissions-Policy. Outer renderer permits trusted inline bootstrap/styles; tenant code stays inside the sandbox.                                                                            |
| 32. RLS               | Forced tenant RLS, checked RPC mutations, assignment/permission/entitlement checks, developer-source redaction and narrow public projections.                                                                               |
| 33. Audit             | Website events and existing audit logs preserve actor and mutation history.                                                                                                                                                 |
| 34. Tables            | Public websites, website_members, website_versions, website_domains, website_assets, website_events, website_platform_settings and website_plan_limits; private build keys, asset bytes, form limits and aggregate metrics. |
| 35. Migrations        | Twelve additive migrations, 20261005000000 through 20261005001100; 80 total. Prior migration hashes are checked against the saved 68-file baseline.                                                                         |
| 36. UI routes         | Business /dashboard/website, /[id], /[id]/[tab] and media routes; Platform Admin /dashboard/website.                                                                                                                        |
| 37. Public routes     | /, published nested paths, /sitemap.xml, /robots.txt, /assets/[id], POST /api/enquiry.                                                                                                                                      |

## Verification evidence

| Requested report item      | Actual result                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 38. Unit/integration tests | 185 tests passed in 27 files against the migrated disposable PostgreSQL database. Includes prior-phase integration/concurrency suites and website tests.                                                                                                                                                                                                                                     |
| 39. Database assertions    | Fresh phase8_resume_verify applied all 80 migrations and repeatable seeds, emitting 656 PASS notices including reused fixture checks. The separate transactional regression run exited zero with 655 PASS notices. The website suite contains 41 assertions. All 68 pre-Phase-8 migration hashes match the saved baseline. Generated schema types and deterministic catalog/CRM seeds match. |
| 40. Playwright             | 25 passed, 59 skipped, zero failures across 84 combinations. Includes eight-page desktop/mobile renderer coverage, preview selection/noindex, sandbox isolation and public HTTP 404. Skips remain explicit for other-app combinations and opt-in hosted tests.                                                                                                                               |
| 41. Builds                 | Business App, Platform Admin and Websites production builds passed. Websites rebuilt after correcting the public 404 response.                                                                                                                                                                                                                                                               |
| 42. Secret scan            | Final post-build scan checked 60 browser JavaScript files; no privileged environment names or server-secret canary found.                                                                                                                                                                                                                                                                    |

Frozen dependency installation passed with pnpm 10.34.5. Formatting and lint passed after fixing the preview state declaration order and formatting two Platform Admin files. Strict TypeScript passed after validating plan-limit configuration rather than passing an unchecked optional value. The ordinary test run passed 174 tests and skipped 11 database-dependent tests; the database-backed run passed all 185.

The local performance sample compiled and rendered all eight starter pages 30 times: median 4.75 ms, p95 38.81 ms, and 40,507 total HTML bytes across the eight pages. One thousand cached lookups including identity assertions took 46.54 ms. These are process-local fixture measurements on a shared development machine, not network, database, browser Web Vitals or production latency benchmarks.

The saved 1440-pixel and 390-pixel starter homepage screenshots were visually inspected for text wrapping, spacing, image placement and clipping. Browser assertions cover all eight pages at both widths. This does not substitute for authenticated editor visual acceptance.

## 43. Hosted acceptance

Confirmed development Supabase credentials are unavailable. Local PostgreSQL tests exercise database policy behavior but do not emulate Supabase Auth/PostgREST. Authenticated authoring, publication, developer-role revocation, storage delivery, DNS routing and live HTTPS require hosted acceptance before release.

## 44. Known limitations

- Browser fixtures cover renderer output and sandbox behavior; they do not establish full authenticated builder workflow acceptance.
- Certificates are verified after external provisioning. IPv6-only and nonmatching proxy address configurations need a deployment adapter.
- Media uses bounded database byte storage. External object storage and malware scanning remain deployment enhancements.
- Starter application saves sections sequentially; a failure may leave a partial draft and uploaded assets, but never publishes the partial result. Deploy the Interior asset directory with Business App.
- Imported catalog/project content is reviewed snapshot data, not automatic live synchronization. Route renaming does not create redirects.
- Forms require name, normalized phone and explicit consent. Rate limiting is per website/minute, supplemented by deployment edge controls if needed.
- Metrics count page requests and submissions, including repeat/bot traffic; they are not unique-visitor analytics.
- Static source limits do not guarantee bounded JavaScript runtime. No arbitrary npm packages, server code, Git build integration or advanced tracking is provided.

## 45. Phase 9 recommendation

Complete hosted Phase 8 acceptance and address its findings before proposing Phase 9. Brochure Builder and advanced automation have not been started.

## Reproduction

Final local evidence is in .tools/phase8-resume-check-final.log, phase8-resume-db.log, phase8-resume-db-regression.log, phase8-resume-tests.log, phase8-resume-types.log, phase8-resume-seeds.log, phase8-resume-404-build.log, phase8-resume-e2e.log and phase8-resume-security.log. These are ignored scratch artifacts. The combined check initially exposed the public 404 regression; after removing the loading boundary that committed HTTP 200 prematurely, the affected application was rebuilt and the full browser suite passed. Final changed-file formatting and lint also passed.

Run pnpm install --frozen-lockfile and pnpm check. For database verification, create a new disposable PostgreSQL database, set TEST_DATABASE_URL and ALLOW_TEST_DATABASE_RESET=yes, then run pnpm db:verify, pnpm db:types:check, pnpm db:seed:check and pnpm test. Never use a production database. The verifier refuses nonempty databases.

See WEBSITE-ARCHITECTURE.md, WEBSITE-BUILDER.md, WEBSITE-RENDERER.md, WEBSITE-DOMAINS.md, WEBSITE-SEO.md, WEBSITE-FORMS.md, WEBSITE-DEVELOPER-MODE.md and WEBSITE-SECURITY.md for behavior and deployment configuration.
