-- Store the signed quotation's ordered work / site check / test / QC references.
-- Existing stages remain unchanged; the new column is metadata pointing at
-- their canonical indexed work and site-check records, not a second checklist.
alter table private.project_stage_guidance
 add column if not exists flow jsonb not null default '[]'::jsonb
 check(jsonb_typeof(flow)='array' and jsonb_array_length(flow)<=150);

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
   (v_item.value-array['work','materials','checks','reports','flow'])<>'{}'::jsonb or
   jsonb_typeof(v_item.value->'materials') is distinct from 'array' or
   jsonb_array_length(v_item.value->'materials')>50 or
   jsonb_typeof(v_item.value->'reports') is distinct from 'array' or
   jsonb_array_length(v_item.value->'reports')>50 or
   (v_item.value ? 'flow' and (
     jsonb_typeof(v_item.value->'flow') is distinct from 'array' or
     jsonb_array_length(v_item.value->'flow')>150)) or
   exists(select 1 from jsonb_array_elements(coalesce(v_item.value->'flow','[]'::jsonb)) f
     where jsonb_typeof(f.value) is distinct from 'object'
       or (f.value-array['kind','index']) <> '{}'::jsonb
       or f.value->>'kind' not in ('work','check','test','qc')
       or jsonb_typeof(f.value->'index') is distinct from 'number'
       or (f.value->>'index') !~ '^(0|[1-9][0-9]?)
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
    organization_id,project_id,stage_id,revision_id,materials,reports,flow)
   values(p_org,c.project_id,v_stage,rev.id,v_item.value->'materials',v_item.value->'reports',
     coalesce(v_item.value->'flow','[]'::jsonb))
   on conflict(organization_id,project_id,stage_id) do nothing;
  v_count=v_count+1;
 end loop;
 return jsonb_build_object('imported',v_count);
end
$f$;

create or replace function public.project_stage_guidance_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.site_access(p_org,p_project) or
   not private.site_allowed(p_org,p_project,array['manager','site_engineer','procurement','quality_inspector'])
 then raise exception 'Stage guidance unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'stage_id',g.stage_id,'materials',g.materials,'reports',g.reports,'flow',g.flow) order by g.stage_id)
   from private.project_stage_guidance g
   where g.organization_id=p_org and g.project_id=p_project),'[]'::jsonb);
end
$f$;

revoke all on function public.project_quote_stage_guidance_import(uuid,uuid) from public,anon;
revoke all on function public.project_stage_guidance_read(uuid,uuid) from public,anon;
grant execute on function public.project_quote_stage_guidance_import(uuid,uuid) to authenticated;
grant execute on function public.project_stage_guidance_read(uuid,uuid) to authenticated;


       or (f.value->>'index')::int >= 50) or
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

create or replace function public.project_stage_guidance_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.site_access(p_org,p_project) or
   not private.site_allowed(p_org,p_project,array['manager','site_engineer','procurement','quality_inspector'])
 then raise exception 'Stage guidance unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'stage_id',g.stage_id,'materials',g.materials,'reports',g.reports) order by g.stage_id)
   from private.project_stage_guidance g
   where g.organization_id=p_org and g.project_id=p_project),'[]'::jsonb);
end
$f$;

revoke all on function public.project_quote_stage_guidance_import(uuid,uuid) from public,anon;
revoke all on function public.project_stage_guidance_read(uuid,uuid) from public,anon;
grant execute on function public.project_quote_stage_guidance_import(uuid,uuid) to authenticated;
grant execute on function public.project_stage_guidance_read(uuid,uuid) to authenticated;

