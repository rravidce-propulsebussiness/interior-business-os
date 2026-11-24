-- Reconcile quotation stage guidance import. Earlier migrations diverged:
-- one kept the ordered execution flow, the revision guard and the saved-Final
-- gate; a later one added item-level work/QC guides but replaced the function
-- without those. The app sends both "flow" and "guides", so this version keeps
-- every guard and stores both.
alter table private.project_stage_guidance
 add column if not exists flow jsonb not null default '[]'::jsonb,
 add column if not exists item_guides jsonb not null default '[]'::jsonb;

do $migration$
begin
 if not exists(select 1 from pg_constraint where conname='project_stage_guidance_item_guides_array') then
  alter table private.project_stage_guidance
   add constraint project_stage_guidance_item_guides_array
   check(jsonb_typeof(item_guides)='array' and jsonb_array_length(item_guides)<=150);
 end if;
end
$migration$;

create or replace function public.project_quote_stage_guidance_import(
 p_org uuid,p_contract uuid
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare c public.contracts;rev public.quotation_revisions;
 v_raw text;v_json jsonb;v_stages jsonb;v_item record;v_guide record;
 v_stage uuid;v_count integer:=0;
begin
 select * into c from public.contracts where id=p_contract and organization_id=p_org;
 if c.id is null or c.status in ('cancelled','closed') then
  raise exception 'Accepted project agreement required' using errcode='42501';end if;
 if not (private.construction_can_manage(p_org,c.project_id)
   or (c.created_by=auth.uid() and private.finance_access(p_org,'contract.create'))) then
  raise exception 'Only agreement creator or project manager may import stage guidance' using errcode='42501';end if;
 select * into rev from public.quotation_revisions where id=c.revision_id and organization_id=p_org;
 if rev.id is null
   or not (
     rev.status in('issued','superseded')
     or (rev.status='draft' and c.status='pending' and c.acceptance_id is null
       and exists(
         select 1 from public.quotations q
          where q.organization_id=p_org and q.id=rev.quotation_id
            and q.customer_id=c.customer_id and q.current_revision_id=rev.id
            and q.status='draft'
            and (public.quotation_final_choices(p_org,array[q.customer_id])->>q.customer_id::text)
              =q.id::text))
   )
   or not exists(select 1 from private.construction_project_stages
     where project_id=c.project_id and organization_id=p_org) then
  raise exception 'Current Final quotation stage snapshot required' using errcode='42501';end if;
 v_raw=split_part(split_part(coalesce(rev.terms,''),'[STAGE_CUSTOM_REQUIREMENTS]',2),
   '[/STAGE_CUSTOM_REQUIREMENTS]',1);
 -- A replaced agreement must never import workflow metadata from a
 -- different quotation than the snapshot that created these project stages.
 if not exists(
   select 1 from private.project_quote_timeline_sources src
    where src.organization_id=p_org and src.project_id=c.project_id
      and src.revision_id=rev.id and src.industry_key='construction'
 ) then
   raise exception 'Stage guidance revision does not match the frozen project timeline'
    using errcode='23514';
 end if;
 if v_raw='' then return jsonb_build_object('imported',0);end if;
 -- Matches the 250000-character limit the app enforces when saving.
 if length(v_raw)>250000 then raise exception 'Invalid customization size' using errcode='22023';end if;
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
   (v_item.value-array['work','materials','checks','reports','flow','guides'])<>'{}'::jsonb or
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
       or f.value->>'kind' not in ('work','check','test','qc','payment','material')
       or jsonb_typeof(f.value->'index') is distinct from 'number'
       or (f.value->>'index') not similar to '[0-9]{1,2}'
        or (f.value->>'index')::int >= 50) or
   exists(select 1 from jsonb_array_elements(v_item.value->'materials') x
     where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>180) or
   exists(select 1 from jsonb_array_elements(v_item.value->'reports') x
     where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>180) or
   (v_item.value ? 'guides' and (jsonb_typeof(v_item.value->'guides') is distinct from 'array'
    or jsonb_array_length(v_item.value->'guides')>150))
  then raise exception 'Invalid project-specific material, report or guide' using errcode='22023';end if;
  for v_guide in select value from jsonb_array_elements(coalesce(v_item.value->'guides','[]'::jsonb)) loop
   if jsonb_typeof(v_guide.value) is distinct from 'object' or
    (v_guide.value-array['kind','index','text','videoUrl'])<>'{}'::jsonb or
    jsonb_typeof(v_guide.value->'kind') is distinct from 'string' or
    v_guide.value->>'kind' not in ('work','material','check','test','qc') or
    jsonb_typeof(v_guide.value->'index') is distinct from 'number' or
    (v_guide.value->>'index') !~ '^[0-9]+$' or
    jsonb_typeof(v_guide.value->'text') is distinct from 'string' or
    length(v_guide.value->>'text')>1800 or
    (v_guide.value ? 'videoUrl' and
     (jsonb_typeof(v_guide.value->'videoUrl') is distinct from 'string' or
      length(v_guide.value->>'videoUrl')>1000 or
      (v_guide.value->>'videoUrl') !~* '^https://'))
   then raise exception 'Invalid work or QC guide' using errcode='22023';end if;
   if (v_guide.value->>'kind'='work' and
       (v_guide.value->>'index')::integer>=jsonb_array_length(coalesce(v_item.value->'work','[]'::jsonb))) or
      (v_guide.value->>'kind'='material' and
       (v_guide.value->>'index')::integer>=jsonb_array_length(v_item.value->'materials')) or
      (v_guide.value->>'kind' in ('check','test','qc') and
       (v_guide.value->>'index')::integer>=jsonb_array_length(coalesce(v_item.value->'checks','[]'::jsonb)))
   then raise exception 'Guide points to a missing work or QC item' using errcode='22023';end if;
  end loop;
  select id into v_stage from private.construction_project_stages
   where organization_id=p_org and project_id=c.project_id
    and instance_code=v_item.key;
  if v_stage is null then raise exception 'Quotation references unrecognized stage' using errcode='23514';end if;
  insert into private.project_stage_guidance(
    organization_id,project_id,stage_id,revision_id,materials,reports,flow,item_guides)
   values(p_org,c.project_id,v_stage,rev.id,v_item.value->'materials',v_item.value->'reports',
     coalesce(v_item.value->'flow','[]'::jsonb),coalesce(v_item.value->'guides','[]'::jsonb))
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
   'stage_id',g.stage_id,'materials',g.materials,'reports',g.reports,
   'flow',g.flow,'guides',g.item_guides) order by g.stage_id)
   from private.project_stage_guidance g
   where g.organization_id=p_org and g.project_id=p_project),'[]'::jsonb);
end
$f$;

revoke all on function public.project_quote_stage_guidance_import(uuid,uuid) from public,anon;
revoke all on function public.project_stage_guidance_read(uuid,uuid) from public,anon;
grant execute on function public.project_quote_stage_guidance_import(uuid,uuid) to authenticated;
grant execute on function public.project_stage_guidance_read(uuid,uuid) to authenticated;
