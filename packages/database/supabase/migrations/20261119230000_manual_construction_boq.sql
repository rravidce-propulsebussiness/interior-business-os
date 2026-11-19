begin;

-- Manual construction quantity takeoffs replace the old recipe-led BOQ UI.
-- Keep quotation references and immutable quote price snapshots with each BOQ.
create table public.construction_boq_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid,
  quotation_revision_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft','final')),
  currency text not null default 'INR' check (length(currency) between 3 and 3),
  document jsonb not null default '{"items":[]}'::jsonb
    check (jsonb_typeof(document)='object' and octet_length(document::text)<=1000000),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,project_id) references public.projects(organization_id,id),
  foreign key (organization_id,quotation_revision_id) references public.quotation_revisions(organization_id,id),
  foreign key (organization_id,quotation_revision_id,project_id) references public.quotation_revisions(organization_id,id,project_id),
  check (quotation_revision_id is null or project_id is not null)
);
create index construction_boq_documents_tenant on public.construction_boq_documents(organization_id,updated_at desc,id);
alter table public.construction_boq_documents enable row level security;
alter table public.construction_boq_documents force row level security;
revoke all on public.construction_boq_documents from public,anon,authenticated;
grant select,insert,update,delete on public.construction_boq_documents to authenticated;
create policy construction_boq_read on public.construction_boq_documents for select to authenticated
  using (private.execution_access(organization_id,'estimate.view'));
create policy construction_boq_insert on public.construction_boq_documents for insert to authenticated
  with check (private.execution_access(organization_id,'estimate.create'));
create policy construction_boq_update on public.construction_boq_documents for update to authenticated
  using (private.execution_access(organization_id,'estimate.edit'))
  with check (private.execution_access(organization_id,'estimate.edit'));
create policy construction_boq_delete on public.construction_boq_documents for delete to authenticated
  using (private.execution_access(organization_id,'estimate.edit'));
create trigger touch_updated_at before update on public.construction_boq_documents
  for each row execute function private.touch_updated_at();

-- Company-configurable material and labour rates used by the manual BOQ.
create table public.construction_boq_rate_cards (
  organization_id uuid primary key references public.organizations(id),
  rates jsonb not null default '{"items":[]}'::jsonb
    check (jsonb_typeof(rates)='object' and octet_length(rates::text)<=200000),
  version integer not null default 1 check (version > 0),
  updated_by uuid references public.profiles(id) default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.construction_boq_rate_cards enable row level security;
alter table public.construction_boq_rate_cards force row level security;
revoke all on public.construction_boq_rate_cards from public,anon,authenticated;
grant select,insert,update on public.construction_boq_rate_cards to authenticated;
create policy construction_boq_rates_read on public.construction_boq_rate_cards for select to authenticated
  using (private.execution_access(organization_id,'estimate.view_cost'));
create policy construction_boq_rates_insert on public.construction_boq_rate_cards for insert to authenticated
  with check (private.execution_access(organization_id,'estimate.create'));
create policy construction_boq_rates_update on public.construction_boq_rate_cards for update to authenticated
  using (private.execution_access(organization_id,'estimate.edit'))
  with check (private.execution_access(organization_id,'estimate.edit'));
create trigger touch_updated_at before update on public.construction_boq_rate_cards
  for each row execute function private.touch_updated_at();

commit;
