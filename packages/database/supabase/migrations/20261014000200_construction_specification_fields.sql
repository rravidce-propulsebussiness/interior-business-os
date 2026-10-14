-- Configurable construction specification categories and fields.
-- Platform may configure defaults; each company still owns its package data,
-- pricing and document snapshots independently.
begin;
create table private.construction_spec_field_templates (
 singleton boolean primary key default true check (singleton),
 sections jsonb not null,
 updated_at timestamptz not null default now()
);
revoke all on private.construction_spec_field_templates from public,anon,authenticated;
insert into private.construction_spec_field_templates(singleton,sections)
values(true,'[{"title":"Architectural plans","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"plans","deliverables":[],"extraFields":[]},{"title":"Steel / TMT","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Cement","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Sand & aggregates","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Bricks / blocks","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Tiles / flooring","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Kitchen & granite","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Doors & windows","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Bathrooms & plumbing","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Electrical materials","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Painting","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Elevation & metal works","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"material","deliverables":[],"extraFields":[]},{"title":"Exclusions & warranty","brand":"","grade":"","description":"","allowancePerSqft":"","kind":"custom","deliverables":[],"extraFields":[]}]'::jsonb);

create function private.valid_construction_spec_sections(v_sections jsonb)
returns boolean language plpgsql immutable set search_path='' as $valid$
declare section jsonb; detail jsonb;
begin
 if jsonb_typeof(v_sections) is distinct from 'array'
    or jsonb_array_length(v_sections)>18
    or octet_length(v_sections::text)>12000
 then return false;end if;
 for section in select value from jsonb_array_elements(v_sections) loop
  if jsonb_typeof(section) is distinct from 'object'
    or (section-array['title','brand','grade','description','allowancePerSqft','kind','deliverables','extraFields'])<>'{}'::jsonb
    or length(btrim(coalesce(section->>'title',''))) not between 2 and 90
    or length(coalesce(section->>'brand',''))>120
    or length(coalesce(section->>'grade',''))>120
    or length(coalesce(section->>'description',''))>600
    or length(coalesce(section->>'allowancePerSqft',''))>40
    or coalesce(section->>'kind','material') not in ('plans','material','custom')
  then return false;end if;
  if section ? 'deliverables' then
   if jsonb_typeof(section->'deliverables') is distinct from 'array'
     or jsonb_array_length(section->'deliverables')>20
   then return false; end if;
   for detail in select value from jsonb_array_elements(section->'deliverables') loop
    if jsonb_typeof(detail) is distinct from 'string'
      or length(btrim(detail #>> '{}')) not between 2 and 90
    then return false;end if;
   end loop;
  end if;
  if section ? 'extraFields' then
   if jsonb_typeof(section->'extraFields') is distinct from 'array'
       or jsonb_array_length(section->'extraFields')>8 then return false; end if;
   for detail in select value from jsonb_array_elements(section->'extraFields') loop
    if jsonb_typeof(detail) is distinct from 'object'
      or (detail-array['label','value'])<>'{}'::jsonb
      or length(btrim(coalesce(detail->>'label',''))) not between 2 and 70
      or length(coalesce(detail->>'value',''))>250
    then return false;end if;
   end loop;
  end if;
  if coalesce(section->>'kind','material')='plans'
    and (coalesce(section->>'brand','')<>'' or coalesce(section->>'grade','')<>''
      or coalesce(section->>'allowancePerSqft','')<>'')
  then return false;end if;
 end loop;
 return true;
end $valid$;
revoke all on function private.valid_construction_spec_sections(jsonb)
from public,anon,authenticated;

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
   or v_visibility <> 'company'
   or jsonb_typeof(v_sections) is distinct from 'array'
   or jsonb_array_length(v_sections)>18
   or octet_length(v_sections::text)>12000
   or jsonb_typeof(v_owners) is distinct from 'array'
   or jsonb_array_length(v_owners)<>0
 then raise exception 'Invalid package fields' using errcode='22023';end if;
 if not private.valid_construction_spec_sections(v_sections) then
   raise exception 'Invalid construction specification fields' using errcode='22023';
 end if;
 -- Obsolete optional fields are accepted only if they represent company-wide
 -- access, allowing an older open form to save during rollout.
 v_owner_ids='{}'::uuid[];
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
     raise exception 'Package unavailable for this company' using errcode='42501';end if;
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

create function public.construction_spec_template_get(p_org uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $get$
begin
 if p_org is null then
   perform private.require_platform('platform.catalog.view');
 else
   perform private.require_permission(p_org,'pricing.view');
   if not private.entitled(p_org,'pricing')
   then raise exception 'Pricing not enabled' using errcode='42501';end if;
 end if;
 return (select sections from private.construction_spec_field_templates where singleton);
end $get$;

create function public.platform_construction_spec_template_save(p_sections jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $set$
begin
 perform private.require_platform('platform.organizations.manage');
 if not private.valid_construction_spec_sections(p_sections)
 then raise exception 'Invalid global construction specification template' using errcode='22023'; end if;
 update private.construction_spec_field_templates
    set sections=p_sections,updated_at=now()
    where singleton;
 insert into public.audit_logs(
  actor_user_id,organization_id,action,entity_type,entity_id,metadata
 ) values (
  auth.uid(),null,'platform.construction_specs.updated','platform_template','construction',
  jsonb_build_object('categories',jsonb_array_length(p_sections))
 );
 return true;
end $set$;

revoke all on function public.construction_spec_template_get(uuid),
 public.platform_construction_spec_template_save(jsonb)
 from public,anon,authenticated;
grant execute on function public.construction_spec_template_get(uuid),
 public.platform_construction_spec_template_save(jsonb)
 to authenticated;
commit;
