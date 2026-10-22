-- Secure immutable quotation-to-project stage guidance import against contract replacement.
create or replace function public.project_quote_stage_guidance_import(
 p_org uuid,p_contract uuid
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare c public.contracts;rev public.quotation_revisions;
 v_raw text;v_json jsonb;v_stages jsonb;v_item record;v_stage uuid;v_count integer:=0;
begin
 select * into c from public.contracts where id=p_contract and organization_id=p_org;
 if c.id is null or c.status in ('cancelled','closed') then
  raise exception 'Accepted project agreement required' using errcode='42501';end if;
 if not (private.construction_can_manage(p_org,c.project_id)
   or (c.created_by=auth.uid() and private.finance_access(p_org,'contract.create'))) then
  raise exception 'Only agreement creator or project manager may import stage guidance' using errcode='42501';end if;
 select * into rev from public.quotation_revisions where id=c.revision_id and organization_id=p_org
   and status in('issued','superseded');
 if rev.id is null or
   not exists(select 1 from private.construction_project_stages
     where project_id=c.project_id and organization_id=p_org) then
  raise exception 'Approved quotation stage snapshot required' using errcode='42501';end if;
 v_raw=split_part(split_part(coalesce(rev.terms,''),'[STAGE_CUSTOM_REQUIREMENTS]',2),
   '[/STAGE_CUSTOM_REQUIREMENTS]',1);
 -- A replacement agreement may refer to a different quote revision while
 -- this project still holds stages frozen from the original signed revision.
 -- Never mix material/report guidance from one revision with the activities
 -- and structural QC requirements of another.
 if not exists(
   select 1 from private.project_quote_timeline_sources src
    where src.organization_id=p_org and src.project_id=c.project_id
      and src.revision_id=rev.id and src.industry_key='construction'
 ) then
   raise exception 'Stage guidance revision does not match the frozen project timeline'
    using errcode='23514';
 end if;
 if v_raw='' then return jsonb_build_object('imported',0);end if;
 if length(v_raw)>7500 then raise exception 'Invalid customization size' using errcode='22023';end if;
 v_json=v_raw::jsonb;
 if jsonb_typeof(v_json) is distinct from 'object' or
  v_json->>'version' is distinct from '1' or
  jsonb_typeof(v_json->'stages') is distinct from 'object' or
  (v_json-array['version','stages'])<>'{}'::jsonb then
  raise exception 'Invalid frozen quotation requirements' using errcode='22023';end if;
 v_stages=v_json->'stages';
 if (select count(*) from jsonb_object_keys(v_stages))>35 then
  raise exception 'Too many stage overrides' using errcode='22023';end if;
 for v_item in select key,value from jsonb_each(v_stages) loop
  if jsonb_typeof(v_item.value) is distinct from 'object' or
   (v_item.value-array['work','materials','checks','reports'])<>'{}'::jsonb or
   jsonb_typeof(v_item.value->'materials') is distinct from 'array' or
   jsonb_array_length(v_item.value->'materials')>50 or
   jsonb_typeof(v_item.value->'reports') is distinct from 'array' or
   jsonb_array_length(v_item.value->'reports')>50 or
   exists(select 1 from jsonb_array_elements(v_item.value->'materials') x
     where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>180) or
   exists(select 1 from jsonb_array_elements(v_item.value->'reports') x
     where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>180)
  then raise exception 'Invalid project-specific material or report' using errcode='22023';end if;
  select id into v_stage from private.construction_project_stages
   where organization_id=p_org and project_id=c.project_id
    and instance_code=v_item.key;
  if v_stage is null then raise exception 'Quotation references unrecognized stage' using errcode='23514';end if;
  insert into private.project_stage_guidance(
    organization_id,project_id,stage_id,revision_id,materials,reports)
   values(p_org,c.project_id,v_stage,rev.id,v_item.value->'materials',v_item.value->'reports')
   on conflict(organization_id,project_id,stage_id) do nothing;
  v_count=v_count+1;
 end loop;
 return jsonb_build_object('imported',v_count);
end
$f$;

