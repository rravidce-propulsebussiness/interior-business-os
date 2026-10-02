# Public renderer

The Websites application resolves the normalized Host header through website_public. Only active, verified, HTTPS-ready domains attached to published, enabled and unsuspended websites resolve. Unknown configured hosts and unknown page routes return 404. An unconfigured local application retains its original foundation shell.

The public response contains the immutable snapshot projection, version and current form capability. It never reads draft documents or private source entities. Draft-only pages, unused assets, saved sections, unapproved content and internal source references are removed by the compiler. Host and entitlement checks run for every request. A bounded 16-entry process cache stores compiled builds by hostname plus immutable published version; it does not cache authorization. Publish and restore select a different key. Dynamic HTML and media are not given a shared public cache lifetime, so suspension and revocation are immediate on subsequent requests.

Routes: /, arbitrary published nested paths, /sitemap.xml, /robots.txt, /assets/:id, and POST /api/enquiry. Metadata, Open Graph, canonical links and organization JSON-LD use the same snapshot. Media requires an explicit reference in the current published version. Assets from another tenant or an unpublished draft are unavailable. PDF downloads use attachment disposition and sandbox headers.

Daily aggregate page-request and lead-submission counts contain no IP address, cookie, fingerprint or visitor profile. Page requests include bots and prefetch/repeat requests; they are not unique visitors. Counts can be inflated by public traffic and are informational. No advanced analytics or third-party tracking is included.
