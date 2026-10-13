-- Private PDF annexures for tenant quotation revisions.
-- No authenticated/anonymous direct table reads or writes; all requests go
-- through authenticated, company-scoped application routes.
begin;

create table public.quotation_studio_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  revision_id uuid not null,
  storage_path text not null check (
    length(storage_path) between 15 and 260
    and storage_path !~ '[[:cntrl:]]'
  ),
  filename text not null check (
    length(btrim(filename)) between 1 and 120
    and filename !~ '[[:cntrl:]]'
  ),
  byte_size integer not null check (byte_size between 1 and 15728640),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path),
  foreign key (organization_id, revision_id)
    references public.quotation_revisions(organization_id, id)
);

create index quotation_studio_attachments_revision
on public.quotation_studio_attachments (organization_id, revision_id, created_at, id);

alter table public.quotation_studio_attachments enable row level security;
alter table public.quotation_studio_attachments force row level security;
revoke all on public.quotation_studio_attachments
  from public, anon, authenticated;
-- The trusted Business App server uses a private service-role connection,
-- having first verified quotation.view or quotation.edit for this organization.
-- No public storage bucket access or unguarded signed URLs are used.

commit;
