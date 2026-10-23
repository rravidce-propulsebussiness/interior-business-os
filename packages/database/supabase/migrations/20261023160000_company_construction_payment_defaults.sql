-- Company-wide construction payment milestones are a starting template only.
-- Frozen/accepted quotation stage schedules never look up mutable settings.
create table if not exists private.organization_construction_payment_defaults (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 milestones jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 updated_by uuid,
 constraint construction_defaults_array check(jsonb_typeof(milestones)='array' and jsonb_array_length(milestones)<=40)
);
alter table private.organization_construction_payment_defaults enable row level security;
alter table private.organization_construction_payment_defaults force row level security;
revoke all on private.organization_construction_payment_defaults from PUBLIC,anon,authenticated;

create or replace function public.organization_construction_payment_defaults_read(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $f$
begin
 if (select auth.uid()) is null or not (
  private.has_permission(p_org,'organization.view') or private.has_permission(p_org,'quotation.view')
 ) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((
  select s.milestones from private.organization_construction_payment_defaults s
  where s.organization_id=p_org
 ),'[]'::jsonb);
end;
$f$;
revoke all on function public.organization_construction_payment_defaults_read(uuid) from public,anon;
grant execute on function public.organization_construction_payment_defaults_read(uuid) to authenticated;

create or replace function public.organization_construction_payment_defaults_save(p_org uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path to ''
as $f$
declare
 row jsonb;
 fraction numeric:=0;
 total integer:=0;
begin
 if (select auth.uid()) is null or not private.has_permission(p_org,'organization.manage')
 then raise exception 'Forbidden' using errcode='42501';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array'
  or jsonb_array_length(p_rows)>40 or jsonb_array_length(p_rows)<1 then
  raise exception 'Provide 1–40 payment milestones' using errcode='22023';
 end if;
 for row in select value from jsonb_array_elements(p_rows)
 loop
  if jsonb_typeof(row)<>'object' or (row-array['name','percent'])<>'{}'::jsonb
    or jsonb_typeof(row->'name')<>'string'
    or length(trim(row->>'name')) not between 2 and 100
    or jsonb_typeof(row->'percent') not in ('string','number')
    or (row->>'percent') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
   raise exception 'Invalid payment milestone' using errcode='22023';
  end if;
  if (row->>'percent')::numeric<=0 or (row->>'percent')::numeric>100 then
   raise exception 'Invalid payment percentage' using errcode='22023';end if;
  fraction:=fraction+(row->>'percent')::numeric;
  total:=total+1;
 end loop;
 if total=0 or fraction<>100 then
  raise exception 'Payment percentages must total 100' using errcode='22023';end if;
 insert into private.organization_construction_payment_defaults as current
 (organization_id,milestones,updated_at,updated_by)
 values (p_org,p_rows,now(),(select auth.uid()))
 on conflict(organization_id) do update set
 milestones=excluded.milestones,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
end;
$f$;
revoke all on function public.organization_construction_payment_defaults_save(uuid,jsonb) from public,anon;
grant execute on function public.organization_construction_payment_defaults_save(uuid,jsonb) to authenticated;
