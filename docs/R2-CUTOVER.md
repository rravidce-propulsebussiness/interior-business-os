# R2 cutover: private project media

Cloudflare R2 bucket: **business-os-media** (private, Standard, APAC).

The migration is _additive_: the legacy `private.site_media.bytes` column,
existing PostgREST functions, and URLs stay intact. Only new site uploads use R2
when the feature flag is enabled.

## Activation

1. Deploy the SQL migration `20261020000100_project_site_r2.sql` to the
   **interior-business-os** Supabase project.
2. Create a Cloudflare **Object Read & Write** R2 API token restricted to the
   `business-os-media` bucket. Never paste its secret in GitHub or chat.
3. On the **existing Hostinger Business OS app**, set the following server-side
   variables and redeploy:

   - `BUSINESS_OS_R2_ENABLED=true`
   - `BUSINESS_OS_R2_ACCOUNT_ID=<Cloudflare account ID>`
   - `BUSINESS_OS_R2_ACCESS_KEY_ID=<restricted token access key>`
   - `BUSINESS_OS_R2_SECRET_ACCESS_KEY=<restricted token secret key>`

4. Test a single JPEG, MP4 and PDF, then verify a signed-in company user can
   retrieve each through the **existing project media URL**. Test forbidden
   cross-company access and agreement permissions.
5. Keep legacy rows intact until a separately validated backfill transfers
   them with SHA-256 verification. The new code does **not** delete old data.

## Rollback

Disable `BUSINESS_OS_R2_ENABLED` for **new uploads only**.
Previously created R2-backed rows still need R2 credentials to download.
Do not disable access to R2 or delete the bucket while any R2-backed rows exist.

## Scope

This first cutover covers _project-site media_, including owner uploads of
photos, short video, and PDFs. Website-builder assets, brochure images,
quotation annexures, employee proofs and existing PostgreSQL bytea objects
remain on their current safe paths pending dedicated, verifiable backfill.
The project upload limit is unchanged (8 MiB) to preserve current UI contract.
Do not advertise the entire Business OS as fully migrated yet.
