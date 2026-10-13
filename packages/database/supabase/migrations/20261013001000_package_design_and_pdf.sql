-- Private company-specific package design, visibility and source PDF.
-- All access is mediated by existing authorization and SECURITY DEFINER RPCs.
begin;
create table private.construction_quote_package_designs (
  organization_id uuid not null,
  package_id uuid not null,
  theme_color text not null default '#155EEF'
    check (theme_color ~ '^#[A-Fa-f0-9]{6}$'),
  visibility text not null default 'company'
    check (visibility in ('company','owner_only')),
  spec_sections jsonb not null default '[]'::jsonb
    check (jsonb_typeof(spec_sections) = 'array'
       and jsonb_array_length(spec_sections) <= 18
       and octet_length(spec_sections::text) <= 12000),
  updated_at timestamptz not null default now(),
  primary key (organization_id,package_id),
  foreign key (organization_id,package_id)
    references private.construction_quote_packages(organization_id,id)
    on delete cascade
);
alter table private.construction_quote_package_designs enable row level security;
revoke all on private.construction_quote_package_designs from public,anon,authenticated;

create table public.construction_package_spec_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  package_id uuid not null,
  storage_path text not null check (length(storage_path) between 15 and 260),
  filename text not null check (length(btrim(filename)) between 1 and 120),
  byte_size integer not null check (byte_size between 1 and 15728640),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id,package_id),
  unique (organization_id,storage_path),
  foreign key (organization_id,package_id)
    references private.construction_quote_packages(organization_id,id)
    on delete cascade
);
-- Snapshot package PDFs on draft quotation save, not at PDF download,
-- so subsequent package edits never alter an issued customer document.
alter table public.quotation_studio_attachments
 add column source_package_id uuid;
create unique index quotation_package_spec_snapshot_unique
 on public.quotation_studio_attachments
 (organization_id,revision_id,source_package_id)
 where source_package_id is not null;

create index construction_package_spec_file_lookup
  on public.construction_package_spec_attachments(organization_id,package_id);
alter table public.construction_package_spec_attachments enable row level security;
alter table public.construction_package_spec_attachments force row level security;
revoke all on public.construction_package_spec_attachments from public,anon,authenticated;

-- Owner-only means the creating user or a company owner with an active
-- unscoped role. An organization user with pricing.view is otherwise allowed.
create function private.can_view_construction_package(p_org uuid,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $f$
  select exists (
    select 1
    from private.construction_quote_packages p
    left join private.construction_quote_package_designs d
      on d.organization_id=p.organization_id and d.package_id=p.id
    where p.organization_id=p_org and p.id=p_id
      and (coalesce(d.visibility,'company')='company'
        or p.created_by=auth.uid()
        or exists (
          select 1
          from public.organization_memberships m
          join public.membership_roles mr
            on mr.organization_id=m.organization_id
           and mr.membership_id=m.id
          join public.roles r
            on r.organization_id=mr.organization_id and r.id=mr.role_id
          where m.organization_id=p_org and m.user_id=auth.uid()
            and m.status='active' and m.branch_id is null
            and mr.branch_id is null and r.is_owner
        ))
  );
$f$;
revoke all on function private.can_view_construction_package(uuid,uuid) from public,anon,authenticated;

create or replace function public.construction_package_list(p_org uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
begin
  perform private.require_permission(p_org,'pricing.view');
  if not private.entitled(p_org,'pricing') then
    raise exception 'Pricing not enabled' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'code',p.code,
      'description',p.description,'ratePerSqft',p.rate_per_sqft::text,
      'status',p.status,'version',p.version,
      'themeColor',coalesce(d.theme_color,'#155EEF'),
      'visibility',coalesce(d.visibility,'company'),
      'specSections',coalesce(d.spec_sections,'[]'::jsonb),
      'attachmentFilename',a.filename
    ) order by p.name,p.id)
    from private.construction_quote_packages p
    left join private.construction_quote_package_designs d
      on d.organization_id=p.organization_id and d.package_id=p.id
    left join public.construction_package_spec_attachments a
      on a.organization_id=p.organization_id and a.package_id=p.id
    where p.organization_id=p_org
      and private.can_view_construction_package(p_org,p.id)
  ),'[]'::jsonb);
end $fn$;

create or replace function public.construction_package_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_id uuid; v_result uuid; v_version integer; v_name text; v_code text;
 v_description text; v_rate numeric; v_sections jsonb;
 v_theme text; v_visibility text; v_section jsonb;
begin
 perform private.require_permission(p_org,'pricing.manage');
 if not private.has_permission(p_org,'pricing.view')
    or not private.entitled(p_org,'pricing')
 then raise exception 'Pricing access required' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>15000
    or (p_input-array[
      'id','version','name','code','description','ratePerSqft','status',
      'themeColor','visibility','specSections'
    ])<>'{}'::jsonb
 then raise exception 'Invalid package' using errcode='22023';end if;
 v_name=btrim(coalesce(p_input->>'name',''));
 v_code=upper(btrim(coalesce(p_input->>'code','')));
 v_description=btrim(coalesce(p_input->>'description',''));
 v_theme=coalesce(p_input->>'themeColor','#155EEF');
 v_visibility=coalesce(p_input->>'visibility','company');
 v_sections=coalesce(p_input->'specSections','[]'::jsonb);
 if length(v_name) not between 2 and 120
   or v_code !~ '^[A-Z][A-Z0-9-]{1,19}$'
   or length(v_description)>600
   or coalesce(p_input->>'ratePerSqft','') !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$'
   or (p_input->>'ratePerSqft')::numeric<=0
   or coalesce(p_input->>'status','') not in ('active','inactive')
   or v_theme !~ '^#[A-Fa-f0-9]{6}$'
   or v_visibility not in ('company','owner_only')
   or jsonb_typeof(v_sections) is distinct from 'array'
   or jsonb_array_length(v_sections)>18
   or octet_length(v_sections::text)>12000
 then raise exception 'Invalid package fields' using errcode='22023';end if;
 for v_section in select value from jsonb_array_elements(v_sections)
 loop
   if jsonb_typeof(v_section) is distinct from 'object'
      or (v_section-array['title','brand','grade','description','allowancePerSqft'])<>'{}'::jsonb
      or length(btrim(coalesce(v_section->>'title',''))) not between 2 and 90
      or length(coalesce(v_section->>'brand',''))>120
      or length(coalesce(v_section->>'grade',''))>120
      or length(coalesce(v_section->>'description',''))>600
      or length(coalesce(v_section->>'allowancePerSqft',''))>40
   then raise exception 'Invalid material specifications' using errcode='22023';end if;
 end loop;
 v_rate=(p_input->>'ratePerSqft')::numeric;
 v_id=nullif(p_input->>'id','')::uuid;
 if v_id is null then
   insert into private.construction_quote_packages
     (organization_id,name,code,description,rate_per_sqft,status)
   values (p_org,v_name,v_code,v_description,v_rate,p_input->>'status')
   returning id into v_result;
 else
   v_version=(p_input->>'version')::integer;
   if v_version is null or v_version<1 then
     raise exception 'Expected version' using errcode='22023';end if;
   if not private.can_view_construction_package(p_org,v_id) then
     raise exception 'Package restricted to its owner' using errcode='42501';end if;
   update private.construction_quote_packages
      set name=v_name, code=v_code, description=v_description,
          rate_per_sqft=v_rate, status=p_input->>'status',
          version=version+1
    where organization_id=p_org and id=v_id and version=v_version
    returning id into v_result;
   if v_result is null then
     raise exception 'Package changed; reload' using errcode='40001';end if;
 end if;
 insert into private.construction_quote_package_designs
   (organization_id,package_id,theme_color,visibility,spec_sections)
 values (p_org,v_result,v_theme,v_visibility,v_sections)
 on conflict (organization_id,package_id)
 do update set theme_color=excluded.theme_color,
    visibility=excluded.visibility,
    spec_sections=excluded.spec_sections,
    updated_at=now();
 insert into public.audit_logs
   (actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values (auth.uid(),p_org,'construction.package.saved',
   'construction_quote_package',v_result::text,
   jsonb_build_object('code',v_code,'ratePerSqft',v_rate,'visibility',v_visibility));
 return v_result;
end $fn$;

-- Packages do not leak across tenants, even through the fixed-rate preview.
create or replace function public.construction_package_quote_preview(
 p_org uuid,p_package_id uuid,p_ids uuid[],p_area numeric)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare p private.construction_quote_packages; v_count int; v_categories int; v_options jsonb;
begin
 perform private.require_permission(p_org,'pricing.view');
 if not private.entitled(p_org,'pricing') or
    not private.can_view_construction_package(p_org,p_package_id)
 then raise exception 'Package unavailable' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>20 or p_area is null or p_area<=0
 or p_area>1000000 or round(p_area,2)<>p_area
 or (select count(distinct x) from unnest(p_ids) x)<>cardinality(p_ids)
 then raise exception 'Invalid area or options' using errcode='22023';end if;
 select * into p from private.construction_quote_packages
 where organization_id=p_org and id=p_package_id and status='active';
 if not found then raise exception 'Package unavailable' using errcode='22023';end if;
 select count(*),count(distinct category),
 coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'name',name,
 'specification',specification,'version',version)
 order by category,name,id),'[]'::jsonb)
 into v_count,v_categories,v_options
 from private.construction_quote_rates
 where organization_id=p_org and status='active' and id=any(p_ids);
 if v_count<>cardinality(p_ids) or v_categories<>v_count
 then raise exception 'Choose one active brand per category' using errcode='22023';end if;
 return jsonb_build_object('packageId',p.id,'packageName',p.name,
 'packageCode',p.code,'description',p.description,'ratePerSqft',p.rate_per_sqft::text,
 'areaSqft',p_area::text,'total',round(p.rate_per_sqft*p_area,2)::text,'options',v_options);
end $fn$;

commit;