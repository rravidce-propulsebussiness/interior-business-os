-- Accept typed architectural drawings and user-defined fields in private
-- company package specifications. Company-only ACL and pricing remain intact.
begin;
create or replace function public.construction_package_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_id uuid; v_result uuid; v_version integer; v_name text; v_code text;
 v_description text; v_rate numeric; v_sections jsonb;
 v_theme text; v_visibility text; v_section jsonb;
 v_owner_ids uuid[]; v_owners jsonb;
 v_field jsonb; v_drawing jsonb;
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
 for v_section in select value from jsonb_array_elements(v_sections)
 loop
   if jsonb_typeof(v_section) is distinct from 'object'
      or (v_section-array['title','brand','grade','description','allowancePerSqft','kind','deliverables','fields'])<>'{}'::jsonb
      or length(btrim(coalesce(v_section->>'title',''))) not between 2 and 90
      or length(coalesce(v_section->>'brand',''))>120
      or length(coalesce(v_section->>'grade',''))>120
      or length(coalesce(v_section->>'description',''))>600
      or length(coalesce(v_section->>'allowancePerSqft',''))>40
      or (v_section ? 'kind' and v_section->>'kind' not in ('plans','material','custom'))
      or jsonb_typeof(coalesce(v_section->'deliverables','[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(v_section->'deliverables','[]'::jsonb)) > 16
      or jsonb_typeof(coalesce(v_section->'fields','[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(v_section->'fields','[]'::jsonb)) > 10
   then raise exception 'Invalid material specifications' using errcode='22023';end if;
   for v_drawing in select value from
     jsonb_array_elements(coalesce(v_section->'deliverables','[]'::jsonb))
   loop
     if jsonb_typeof(v_drawing) <> 'object'
       or (v_drawing-array['label','included']) <> '{}'::jsonb
       or length(btrim(coalesce(v_drawing->>'label',''))) not between 2 and 90
       or jsonb_typeof(v_drawing->'included') <> 'boolean'
     then raise exception 'Invalid drawing' using errcode='22023';end if;
   end loop;
   for v_field in select value from
     jsonb_array_elements(coalesce(v_section->'fields','[]'::jsonb))
   loop
     if jsonb_typeof(v_field) <> 'object'
       or (v_field-array['label','value']) <> '{}'::jsonb
       or length(btrim(coalesce(v_field->>'label',''))) not between 2 and 80
       or length(coalesce(v_field->>'value','')) > 250
     then raise exception 'Invalid custom field' using errcode='22023';end if;
   end loop;
 end loop;
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
commit;
