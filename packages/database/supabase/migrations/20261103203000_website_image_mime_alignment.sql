-- The application validates JPEG, PNG, WebP and AVIF by file signature and
-- stores original bytes. The initial website_assets check admitted only WebP,
-- causing PostgreSQL check violations for correctly validated JPEG/PNG/AVIF.
-- Preserve PDF/MP4 support and all existing media/history.
begin;

alter table public.website_assets
  drop constraint if exists website_assets_mime_check;

alter table public.website_assets
  add constraint website_assets_mime_check
  check (mime in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'application/pdf',
    'video/mp4'
  ));

commit;
