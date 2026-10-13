-- PostgREST opens STABLE RPCs in read-only transactions. These four
-- functions call private.require_permission(), which locks organizations
-- with SELECT ... FOR UPDATE. As a result they fail with SQLSTATE 25006
-- (HTTP 405) for authenticated users, even company owners.
--
-- Marking these specific functions VOLATILE lets PostgREST provide a
-- read/write transaction for the existing tenant-checked lock. No public
-- table permissions, entitlements, or tenant role grants change.
begin;

alter function public.construction_rate_list(uuid) volatile;
alter function public.construction_package_list(uuid) volatile;
alter function public.construction_rate_quote_preview(uuid, uuid[], numeric) volatile;
alter function public.construction_package_quote_preview(uuid, uuid, uuid[], numeric) volatile;

commit;
