-- Enable Design as a reusable workflow item kind for every industry.
-- Preserve tenant authorization, duplicate-ID checks, QC ordering and all
-- existing validation/GRANT rules of organization_industry_workflow_save.
-- Design is a distinct planning step; this change does not bypass owner
-- approval or automatically mark any design task complete.

create or replace function public.organization_industry_workflow_save(p_org uuid,p_industry text,p_rows jsonb)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
 stage_row jsonb; item jsonb; stage_id text; item_id text; item_kind text;
 stage_ids jsonb:='[]'::jsonb; item_ids jsonb:='[]'::jsonb; prior_checks jsonb;
 stage_count integer:=0; item_count integer:=0;
begin
 if (select auth.uid()) is null or not private.has_permission(p_org,'organization.manage') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if p_industry is null or p_industry !~ '^[a-z][a-z0-9-]{0,59}$'
  or p_rows is null or jsonb_typeof(p_rows)<>'array'
  or jsonb_array_length(p_rows) not between 1 and 30 or length(p_rows::text)>300000 then
  raise exception 'Invalid industry workflow' using errcode='22023';
 end if;
 for stage_row in select value from jsonb_array_elements(p_rows) loop
  stage_count:=stage_count+1;
  if jsonb_typeof(stage_row)<>'object'
   or (stage_row-array['id','name','description','percent','repeatsPerFloor','days','items'])<>'{}'::jsonb
   or jsonb_typeof(stage_row->'id')<>'string'
   or (stage_row->>'id') !~ '^[a-z][a-z0-9-]{0,59}$'
   or jsonb_typeof(stage_row->'name')<>'string' or length(trim(stage_row->>'name')) not between 2 and 100
   or (stage_row ? 'description' and (jsonb_typeof(stage_row->'description')<>'string' or length(stage_row->>'description')>300))
   or jsonb_typeof(stage_row->'repeatsPerFloor')<>'boolean'
   or jsonb_typeof(stage_row->'days') not in ('number','string')
   or (stage_row->>'days') !~ '^[0-9]{1,3}$' or (stage_row->>'days')::integer>365
   or jsonb_typeof(stage_row->'items')<>'array' or jsonb_array_length(stage_row->'items')>100 then
   raise exception 'Invalid workflow stage' using errcode='22023';
  end if;
  stage_id:=stage_row->>'id';
  if stage_ids ? stage_id then raise exception 'Duplicate stage identifier' using errcode='22023'; end if;
  stage_ids:=stage_ids||jsonb_build_array(stage_id);
  prior_checks:='[]'::jsonb;
  for item in select value from jsonb_array_elements(stage_row->'items') loop
   item_count:=item_count+1;
   if item_count>250 or jsonb_typeof(item)<>'object'
    or (item-array['id','kind','title','days','guideText','guideVideoUrl'])<>'{}'::jsonb
    or jsonb_typeof(item->'id')<>'string' or length(item->>'id') not between 1 and 80
    or (item->>'id') !~ '^[A-Za-z0-9_-]+$'
    or jsonb_typeof(item->'kind')<>'string' or item->>'kind' not in ('work','design','material','check','test','qc','payment')
    or jsonb_typeof(item->'title')<>'string' or length(trim(item->>'title')) not between 2 and 180
    or jsonb_typeof(item->'days') not in ('number','string') or (item->>'days') !~ '^[0-9]{1,3}$' or (item->>'days')::integer>365
    or (item ? 'guideText' and (jsonb_typeof(item->'guideText')<>'string' or length(item->>'guideText')>1800))
    or (item ? 'guideVideoUrl' and (jsonb_typeof(item->'guideVideoUrl')<>'string' or length(item->>'guideVideoUrl')>1000 or (trim(item->>'guideVideoUrl')<>'' and (item->>'guideVideoUrl') !~* '^https://'))) then
    raise exception 'Invalid workflow item, type or guide' using errcode='22023';
   end if;
   item_id:=item->>'id'; item_kind:=item->>'kind';
   if item_ids ? item_id then raise exception 'Duplicate stage item identifier' using errcode='22023'; end if;
   item_ids:=item_ids||jsonb_build_array(item_id);
   if item_kind in ('check','test') then prior_checks:=prior_checks||jsonb_build_array(lower(trim(item->>'title'))); end if;
   if item_kind='qc' and jsonb_array_length(prior_checks)=0 then
    raise exception 'QC must follow a site check or test in the same stage' using errcode='22023';
   end if;
  end loop;
 end loop;
 insert into private.organization_construction_payment_defaults as current(organization_id,industry_workflows,updated_at,updated_by)
 values(p_org,jsonb_build_object(p_industry,p_rows),now(),(select auth.uid()))
 on conflict(organization_id) do update set
  industry_workflows=jsonb_set(coalesce(current.industry_workflows,'{}'::jsonb),array[p_industry],excluded.industry_workflows->p_industry,true),
  updated_at=excluded.updated_at,updated_by=excluded.updated_by;
end;
$function$;
revoke all on function public.organization_industry_workflow_save(uuid,text,jsonb) from public,anon;
grant execute on function public.organization_industry_workflow_save(uuid,text,jsonb) to authenticated;
