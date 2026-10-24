-- Upgrade the same company-owned payment template function to support grouped
-- foundation substages, optional scope and up to 300 steps for multi-floor work.
-- This migration changes validation only; existing records remain untouched.
-- Preserve organization.manage permission checks and tenant isolation.
create or replace function public.organization_construction_payment_defaults_save(p_org uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path to ''
as $body$
declare
 r jsonb;
 item jsonb;
 pct numeric:=0;
 seen jsonb;
 prior jsonb;
 total_steps integer:=0;
 name text;
 area text;
 kind text;
begin
 if (select auth.uid()) is null or not private.has_permission(p_org,'organization.manage')
 then raise exception 'Forbidden' using errcode='42501';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array'
  or jsonb_array_length(p_rows) not between 1 and 40
  or length(p_rows::text)>45000 then
  raise exception 'Invalid company construction payment template' using errcode='22023';
 end if;
 for r in select value from jsonb_array_elements(p_rows)
 loop
  if jsonb_typeof(r)<>'object'
   or (r-array['name','percent','steps','areas','areaLabels']) <> '{}'::jsonb
   or jsonb_typeof(r->'name')<>'string'
   or length(trim(r->>'name')) not between 2 and 100
   or jsonb_typeof(r->'percent') not in ('string','number')
   or (r->>'percent') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
   raise exception 'Invalid payment name or percent' using errcode='22023';end if;
  if (r->>'percent')::numeric<=0 or (r->>'percent')::numeric>100 then
   raise exception 'Invalid milestone percentage' using errcode='22023';end if;
  pct:=pct+(r->>'percent')::numeric;
  if r ? 'areas' and (jsonb_typeof(r->'areas')<>'array'
   or jsonb_array_length(r->'areas')>15) then
   raise exception 'Invalid milestone work areas' using errcode='22023';end if;
  if r ? 'areaLabels' then
   if jsonb_typeof(r->'areaLabels')<>'object'
    or (select count(*) from jsonb_object_keys(r->'areaLabels'))>15
    or exists (
      select 1 from jsonb_each_text(r->'areaLabels') as label(area_code,area_label)
      where length(trim(label.area_label)) not between 2 and 80
       or length(label.area_code)>45
       or not (coalesce(r->'areas','[]'::jsonb) ? label.area_code)
    ) then
    raise exception 'Invalid construction work area label' using errcode='22023';end if;
  end if;
  if r ? 'steps' and (jsonb_typeof(r->'steps')<>'array'
   or jsonb_array_length(r->'steps')>100) then
   raise exception 'Invalid milestone work steps' using errcode='22023';end if;
  prior:='[]'::jsonb;
  seen:='[]'::jsonb;
  for item in select value from jsonb_array_elements(coalesce(r->'steps','[]'::jsonb))
  loop
   total_steps:=total_steps+1;
   if total_steps>300 or jsonb_typeof(item)<>'object'
    or (item-array['kind','name','area','substage','optional'])<>'{}'::jsonb
    or jsonb_typeof(item->'name')<>'string'
    or jsonb_typeof(item->'kind')<>'string'
    or jsonb_typeof(item->'area')<>'string' then
    raise exception 'Invalid company work step' using errcode='22023';end if;
   name:=trim(item->>'name');
   area:=item->>'area';
   kind:=item->>'kind';
   if (item ? 'substage' and (jsonb_typeof(item->'substage')<>'string' or length(trim(item->>'substage')) not between 2 and 90))
      or (item ? 'optional' and jsonb_typeof(item->'optional')<>'boolean') then
    raise exception 'Invalid substage or optional work flag' using errcode='22023';end if;
   if length(name) not between 2 and 180
    or area !~ '^[A-Z][A-Z_]*$' or length(area)>45
    or kind not in ('work','material','check','test','qc')
    or (r ? 'areas' and jsonb_array_length(r->'areas')>0
      and not (r->'areas' ? area)) then
    raise exception 'Invalid work/check type, title or work area' using errcode='22023';end if;
   if kind in ('check','test') and length(name)<3 then
    raise exception 'Site checks require a descriptive name' using errcode='22023';end if;
   if seen ? (area||'|'||kind||'|'||lower(name))
   then raise exception 'Duplicate work, material or check in milestone' using errcode='22023';end if;
   seen:=seen||jsonb_build_array(area||'|'||kind||'|'||lower(name));
   if kind in ('check','test') then
    prior:=prior||jsonb_build_array(area||'|'||lower(name));
   elsif kind='qc' and not (prior ? (area||'|'||lower(name))) then
    raise exception 'Company QC must follow the corresponding site check' using errcode='22023';
   end if;
  end loop;
 end loop;
 if pct<>100 then
  raise exception 'Payment milestones must total exactly 100 percent' using errcode='22023';end if;
 insert into private.organization_construction_payment_defaults
 (organization_id,milestones,updated_at,updated_by)
 values(p_org,p_rows,now(),(select auth.uid()))
 on conflict(organization_id) do update set
 milestones=excluded.milestones,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
end;
$body$;
revoke all on function public.organization_construction_payment_defaults_save(uuid,jsonb) from public,anon;
grant execute on function public.organization_construction_payment_defaults_save(uuid,jsonb) to authenticated;
