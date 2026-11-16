-- Replace payment-row/area-linked company defaults with a reusable stage
-- programme. No customer quotation or project records are changed here.
update private.organization_construction_payment_defaults
set milestones = jsonb_build_array(
  jsonb_build_object('id','preconstruction','name','Pre-construction','percent',10,'repeatsPerFloor',false,'days',7,'items','[]'::jsonb),
  jsonb_build_object('id','foundation','name','Foundation','percent',18,'repeatsPerFloor',false,'days',20,'items','[]'::jsonb),
  jsonb_build_object('id','slabs','name','Slabs','percent',27,'repeatsPerFloor',true,'days',15,'items','[]'::jsonb),
  jsonb_build_object('id','brickwork','name','Brickwork','percent',15,'repeatsPerFloor',true,'days',15,'items','[]'::jsonb),
  jsonb_build_object('id','electrical-plumbing','name','Electrical & plumbing','percent',14,'repeatsPerFloor',true,'days',14,'items','[]'::jsonb),
  jsonb_build_object('id','tiles','name','Tiles','percent',9,'repeatsPerFloor',true,'days',10,'items','[]'::jsonb),
  jsonb_build_object('id','painting','name','Painting','percent',7,'repeatsPerFloor',true,'days',10,'items','[]'::jsonb)
), updated_at=now();

create or replace function public.organization_construction_payment_defaults_save(p_org uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path to ''
as $body$
declare
 r jsonb; item jsonb; item_id text; item_title text; item_kind text;
 pct numeric:=0; total_items integer:=0; seen jsonb:='[]'::jsonb; prior jsonb:='[]'::jsonb;
begin
 if (select auth.uid()) is null or not private.has_permission(p_org,'organization.manage') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<>7 or length(p_rows::text)>300000 then
  raise exception 'All seven construction stages are required' using errcode='22023';
 end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_rows))<>7
  or exists(select 1 from unnest(array['preconstruction','foundation','slabs','brickwork','electrical-plumbing','tiles','painting']) wanted
   where not exists(select 1 from jsonb_array_elements(p_rows) as stage_row(value) where stage_row.value->>'id'=wanted)) then
  raise exception 'Invalid construction stage identifiers' using errcode='22023';
 end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r)<>'object' or (r-array['id','name','percent','repeatsPerFloor','days','items'])<>'{}'::jsonb
   or jsonb_typeof(r->'id')<>'string' or jsonb_typeof(r->'name')<>'string'
   or length(trim(r->>'name')) not between 2 and 100
   or jsonb_typeof(r->'percent') not in ('number','string')
   or jsonb_typeof(r->'repeatsPerFloor')<>'boolean'
   or jsonb_typeof(r->'days') not in ('number','string')
   or (r->>'days') !~ '^[0-9]{1,3}$' or (r->>'days')::integer>365
   or jsonb_typeof(r->'items')<>'array' or jsonb_array_length(r->'items')>100 then
   raise exception 'Invalid construction stage' using errcode='22023';
  end if;
  if (r->>'id' in ('preconstruction','foundation'))=(r->>'repeatsPerFloor')::boolean then
   raise exception 'Pre-construction and foundation run once; finish stages repeat per floor' using errcode='22023';
  end if;
  if (r->>'percent') !~ '^[0-9]+(\.[0-9]{1,2})?$' or (r->>'percent')::numeric<=0 or (r->>'percent')::numeric>100 then
   raise exception 'Invalid stage payment share' using errcode='22023';
  end if;
  pct:=pct+(r->>'percent')::numeric;
  prior:='[]'::jsonb;
  for item in select value from jsonb_array_elements(r->'items') loop
   total_items:=total_items+1;
   if total_items>250 or jsonb_typeof(item)<>'object'
    or (item-array['id','kind','title','days','guideText','guideVideoUrl'])<>'{}'::jsonb
    or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'kind')<>'string'
    or jsonb_typeof(item->'title')<>'string' or length(trim(item->>'title')) not between 2 and 180
    or jsonb_typeof(item->'days') not in ('number','string') or (item->>'days') !~ '^[0-9]{1,3}$' or (item->>'days')::integer>365
    or item->>'kind' not in ('work','material','check','test','qc')
    or (item ? 'guideText' and (jsonb_typeof(item->'guideText')<>'string' or length(item->>'guideText')>1800))
    or (item ? 'guideVideoUrl' and (jsonb_typeof(item->'guideVideoUrl')<>'string' or length(item->>'guideVideoUrl')>1000 or (trim(item->>'guideVideoUrl')<>'' and (item->>'guideVideoUrl') !~* '^https://'))) then
    raise exception 'Invalid work, material, check or guide' using errcode='22023';
   end if;
   item_id:=item->>'id'; item_title:=lower(trim(item->>'title')); item_kind:=item->>'kind';
   if seen ? item_id then raise exception 'Duplicate stage item identifier' using errcode='22023'; end if;
   seen:=seen||jsonb_build_array(item_id);
   if item_kind in ('check','test') then prior:=prior||jsonb_build_array(item_title); end if;
   if item_kind='qc' and jsonb_array_length(prior)=0 then
    raise exception 'QC must follow a site check or test in the same stage' using errcode='22023';
   end if;
  end loop;
 end loop;
 if pct<>100 then raise exception 'Stage payment shares must total exactly 100 percent' using errcode='22023'; end if;
 insert into private.organization_construction_payment_defaults(organization_id,milestones,updated_at,updated_by)
 values(p_org,p_rows,now(),(select auth.uid()))
 on conflict(organization_id) do update set milestones=excluded.milestones,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
end;
$body$;
revoke all on function public.organization_construction_payment_defaults_save(uuid,jsonb) from public,anon;
grant execute on function public.organization_construction_payment_defaults_save(uuid,jsonb) to authenticated;
