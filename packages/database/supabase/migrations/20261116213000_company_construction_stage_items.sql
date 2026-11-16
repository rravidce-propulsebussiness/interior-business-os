-- Construction Settings store reusable work-stage templates, not a universal
-- customer payment allocation. Payment items are timeline markers only.
-- Quotation revisions hold the customer-specific priced payment plan.
create or replace function public.organization_construction_payment_defaults_save(
  p_org uuid, p_rows jsonb
)
returns void language plpgsql security definer set search_path to ''
as $body$
declare
  stage jsonb;
  item jsonb;
  stage_id text;
  item_kind text;
  seen_stages text[] := '{}';
  seen_items text[] := '{}';
  expected_stages text[] := array[
    'preconstruction', 'foundation', 'slabs', 'brickwork',
    'electrical-plumbing', 'tiles', 'painting'
  ];
  total_items integer := 0;
  prior_check boolean;
begin
  if (select auth.uid()) is null
     or not private.has_permission(p_org, 'organization.manage') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) <> 7 or length(p_rows::text) > 300000 then
    raise exception 'Exactly seven construction work stages are required'
      using errcode='22023';
  end if;
  for stage in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(stage) <> 'object'
       or stage - array['id','name','days','repeatsPerFloor','items','percent'] <> '{}'::jsonb
       or jsonb_typeof(stage->'id') <> 'string'
       or jsonb_typeof(stage->'name') <> 'string'
       or jsonb_typeof(stage->'days') <> 'number'
       or jsonb_typeof(stage->'repeatsPerFloor') <> 'boolean'
       or jsonb_typeof(stage->'items') <> 'array' then
      raise exception 'Invalid construction stage fields' using errcode='22023';
    end if;
    stage_id := stage->>'id';
    if not stage_id = any(expected_stages)
       or stage_id = any(seen_stages)
       or length(trim(stage->>'name')) not between 2 and 100
       or (stage->>'days') !~ '^[0-9]{1,3}$'
       or (stage->>'days')::integer > 365
       or (stage_id in ('preconstruction','foundation')) <> ((stage->>'repeatsPerFloor') = 'false')
       or jsonb_array_length(stage->'items') > 100 then
      raise exception 'Invalid stage name, duration or floor repeat setting'
        using errcode='22023';
    end if;
    seen_stages := array_append(seen_stages, stage_id);
    prior_check := false;
    for item in select value from jsonb_array_elements(stage->'items') loop
      total_items := total_items + 1;
      if total_items > 250 or jsonb_typeof(item) <> 'object'
         or item - array['id','kind','title','days','guideText','guideVideoUrl'] <> '{}'::jsonb
         or jsonb_typeof(item->'id') <> 'string'
         or jsonb_typeof(item->'kind') <> 'string'
         or jsonb_typeof(item->'title') <> 'string'
         or jsonb_typeof(item->'days') <> 'number' then
        raise exception 'Invalid stage item' using errcode='22023';
      end if;
      item_kind := item->>'kind';
      if item_kind not in ('work','material','check','test','qc','payment')
         or length(item->>'id') not between 1 and 80
         or (item->>'id') = any(seen_items)
         or length(trim(item->>'title')) not between 2 and 180
         or (item->>'days') !~ '^[0-9]{1,3}$'
         or (item->>'days')::integer > 365
         or (item ? 'guideText' and (jsonb_typeof(item->'guideText') <> 'string'
              or length(item->>'guideText') > 1800))
         or (item ? 'guideVideoUrl' and
              (jsonb_typeof(item->'guideVideoUrl') <> 'string'
               or length(item->>'guideVideoUrl') > 1000
               or (trim(item->>'guideVideoUrl') <> ''
                   and (item->>'guideVideoUrl') !~* '^https://'))) then
        raise exception 'Invalid stage item, guide or duration' using errcode='22023';
      end if;
      seen_items := array_append(seen_items, item->>'id');
      if item_kind in ('check','test') then prior_check := true; end if;
      if item_kind = 'qc' and not prior_check then
        raise exception 'Site check/test must precede QC' using errcode='22023';
      end if;
    end loop;
  end loop;
  insert into private.organization_construction_payment_defaults
    (organization_id,milestones,updated_at,updated_by)
  values (p_org,p_rows,now(),(select auth.uid()))
  on conflict (organization_id) do update set
    milestones = excluded.milestones,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
end;
$body$;
revoke all on function public.organization_construction_payment_defaults_save(uuid,jsonb)
  from public,anon;
grant execute on function public.organization_construction_payment_defaults_save(uuid,jsonb)
  to authenticated;
