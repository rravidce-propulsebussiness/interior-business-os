# Website Studio upload, publishing and GitHub import

The Business App website editor uploads images using `/dashboard/website/[id]/uploads/media` and publishes through a signed `website_publish` RPC. The two operations both depend on the **Business OS website schema and its private signing keys**. Image upload currently uses the website media SQL storage adapter (10 MB per file); it is **not** the site's generic R2 upload pipeline.

## Diagnosing media upload errors

In the browser Network panel, select the failed POST and read its **Response** JSON. The code, message, and requestId are safe to share with the administrator; do not share application secrets, raw database credentials or image proof payloads.

- `WEBSITE_BUILD_SIGNATURE_MISMATCH`: the Business App's private `WEBSITE_BUILD_SIGNING_KEY` and `WEBSITE_BUILD_KEY_ID` must match an active record in the **same** Supabase project's `private.website_build_keys` table. Do not log, paste, or check in key values.
- `WEBSITE_MEDIA_RPC_MISSING`: the Business App is pointing at a database without the required `website_asset_save` RPC, or PostgREST needs its schema cache refreshed. Verify the **correct project URL** and apply the documented website migrations through the normal deployment process.
- `WEBSITE_MEDIA_QUOTA`: the tenant's website media allocation is full.
- `WEBSITE_MEDIA_PERMISSION`: recheck website membership/ownership and the `website.media.manage` permission.
- `WEBSITE_IMAGE_UNSUPPORTED`: use a valid JPEG, PNG, WebP or AVIF up to 10 MB; decoded images must be below 40 megapixels.

Do not bypass RLS or use a `service_role` browser key to fix these errors.

## Diagnosing publishing

The editor must have a saved draft, the `website.page.publish` permission, and enabled features for any custom CSS/code or forms. Publish validates the document, signs an immutable build and calls `website_publish`.

- `WEBSITE_PUBLISH_RPC_MISSING`: confirm the correct Supabase project and website migrations, then refresh the PostgREST schema cache.
- `WEBSITE_BUILD_SIGNATURE_MISMATCH`: fix the same private signing-key configuration as media upload.
- `WEBSITE_PUBLISH_MISSING_ASSET`: replace the missing image, save the draft and publish again.
- `WEBSITE_CUSTOM_CODE_NOT_ENTITLED`: publish with a basic theme when available or enable the appropriate Developer Mode capabilities.
- A successful publish does not itself configure custom DNS or HTTPS. Check domain setup and the independent Websites rendering service if a published site cannot be opened publicly.

After updating Hostinger secrets or migrations, restart/redeploy the server and retry with a fresh browser session. Verify actual published versions in the correct project; a successful HTTP 200 alone is not proof that public hostname resolution works.

## GitHub pull and language support

The GitHub source browser can **read and download** many text languages from a public repository, including TSX, JSX, PHP, Python, Java and Go. Source inspection does not execute, host or synchronize that code.

Static HTML pages may also be imported as new, private `/git-*` drafts from the repository root or conventional `pages/`, `dist/`, `build/`, `out/`, and `public/` paths. The sanitizer deliberately removes scripts and unsupported/external assets; review the result in the editor before publishing. If the repository is a React/Next.js/Astro/Vite app, first produce and commit its static HTML export. PHP, Python, and other server backends require separate runtime hosting; never run untrusted GitHub repository scripts on the multi-tenant Business App server.
