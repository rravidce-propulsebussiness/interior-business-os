-- Owner-restricted packages must be selectable by named active company owners,
-- not automatically visible to every owner. Company-wide access is unchanged.
begin;
alter table private.construction_quote_package_designs
 add column allowed_owner_ids uuid[] not null default '{}'::uuid[]
 check (cardinality(allowed_owner_ids) <= 30);

create or replace function private.can_view_construction_package(p_org uuid,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $f$
  select exists (
    select 1
    from private.construction_quote_packages p
    left join private.construction_quote_package_designs d
      on d.organization_id=p.organization_id and d.package_id=p.id
    where p.organization_id=p_org and p.id=p_id
      and (coalesce(d.visibility,'company')='company'
        or p.created_by=auth.uid()
        or auth.uid() = any(coalesce(d.allowed_owner_ids,'{}'::uuid[])))
  );
$f$;

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
      'ownerIds',to_jsonb(coalesce(d.allowed_owner_ids,'{}'::uuid[])),
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
 v_owner_ids uuid[]; v_owners jsonb;
begin
 perform private.require_permission(p_org,'pricing.manage');
 if not private.has_permission(p_org,'pricing.view')
    or not private.entitled(p_org,'pricing')
 then raise exception 'Pricing access required' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>15000
    or (p_input-array[
      'id','version','name','code','description','ratePerSqft','status',
      'themeColor','visibility','specSections','ownerIds'
    ])<>'{}'::jsonb
 then raise exception 'Invalid package' using errcode='22023';end if;
 v_name=btrim(coalesce(p_input->>'name',''));
 v_code=upper(btrim(coalesce(p_input->>'code','')));
 v_description=btrim(coalesce(p_input->>'description',''));
 v_theme=coalesce(p_input->>'themeColor','#155EEF');
 v_visibility=coalesce(p_input->>'visibility','company');
 v_sections=coalesce(p_input->'specSections','[]'::jsonb);
 v_owners=coalesce(p_input->'ownerIds','[]'::jsonb);
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
   or jsonb_typeof(v_owners) is distinct from 'array'
   or jsonb_array_length(v_owners)>30
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
 select coalesce(array_agg(t.owner_id),'{}'::uuid[]) into v_owner_ids
 from (select distinct value::text::uuid owner_id
       from jsonb_array_elements_text(v_owners)) t;
 if exists (
   select 1 from unnest(v_owner_ids) uid
   where not exists (
     select 1 from public.organization_memberships m
     join public.membership_roles mr
       on mr.organization_id=m.organization_id and mr.membership_id=m.id
     join public.roles r
       on r.organization_id=mr.organization_id and r.id=mr.role_id and r.is_owner
     where m.organization_id=p_org and m.user_id=uid
       and m.status='active' and m.branch_id is null and mr.branch_id is null
   )
 ) then raise exception 'Choose active company owners only' using errcode='42501'; end if;
 if v_visibility='company' then v_owner_ids='{}'::uuid[]; end if;
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
   (organization_id,package_id,theme_color,visibility,spec_sections,allowed_owner_ids)
 values (p_org,v_result,v_theme,v_visibility,v_sections,v_owner_ids)
 on conflict (organization_id,package_id)
 do update set theme_color=excluded.theme_color,
    visibility=excluded.visibility,
     allowed_owner_ids=excluded.allowed_owner_ids,
    spec_sections=excluded.spec_sections,
    updated_at=now();
 insert into public.audit_logs
   (actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values (auth.uid(),p_org,'construction.package.saved',
   'construction_quote_package',v_result::text,
   jsonb_build_object('code',v_code,'ratePerSqft',v_rate,'visibility',v_visibility));
 return v_result;
end $fn$;

create function public.construction_package_owner_options(p_org uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $owners$
begin
 perform private.require_permission(p_org,'pricing.manage');
 if not private.entitled(p_org,'pricing')
 then raise exception 'Pricing access required' using errcode='42501'; end if;
 return coalesce((
   select jsonb_agg(jsonb_build_object(
     'id', o.user_id,
     'name', coalesce(nullif(btrim(p.full_name),''),'Company owner')
   ) order by coalesce(nullif(btrim(p.full_name),''),'Company owner'),o.user_id)
   from (
     select distinct m.user_id
     from public.organization_memberships m
     join public.membership_roles mr
       on mr.organization_id=m.organization_id and mr.membership_id=m.id
     join public.roles r
       on r.organization_id=mr.organization_id and r.id=mr.role_id and r.is_owner
     where m.organization_id=p_org
       and m.status='active' and m.branch_id is null and mr.branch_id is null
   ) o
   join public.profiles p on p.id=o.user_id
 ),'[]'::jsonb);
end $owners$;
revoke all on function public.construction_package_owner_options(uuid)
from public,anon,authenticated;
grant execute on function public.construction_package_owner_options(uuid)
to authenticated;

commit;