# Public brochure delivery

Public URLs use `/brochure/{business-slug}/{brochure-slug}` on the Websites application's platform origin. They require no Website record, plan, custom domain or Website entitlement. Configure the same absolute HTTPS `BROCHURE_PUBLIC_ORIGIN` in Business App and Websites so sharing, QR codes, canonical metadata and sitemaps point to the public application.

Only the current published snapshot is returned. Draft, archived, suspended, unshared and entitlement-revoked brochures are unavailable. Every asset, PDF and enquiry request resolves these conditions again. Viewer and image responses avoid public caching that could outlive access revocation. Changing a draft setting alone does not alter its published edition; publish the new settings or immediately unpublish to revoke it.

The responsive viewer includes miniature page previews, next/previous buttons, touch navigation, fit/zoom, download (if enabled), contact CTAs and a compact enquiry form. It renders structured escaped content. Page links stay within the document. The internal Share panel supports copy/open/native sharing and downloadable QR PNGs; QR generation requires a configured HTTPS origin.

SEO metadata comes from the published snapshot. Search indexing is opt-in, with noindex by default. `/brochure/{business}/sitemap.xml` includes only currently public index-enabled brochures. Robots allows independent brochure paths even when the optional Website is absent. Public endpoints expose no draft document, tenant-private source records or internal cost fields.

Routes: viewer at the base path; `/pdf` for the current downloadable edition; `/assets/{asset}` for snapshot-referenced images; POST `/enquiry` and `/metrics`. There is no public historical-edition endpoint. Public forms are covered in BROCHURE-CRM.md.
