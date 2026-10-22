-- Preserve stage-level canonical approvals/marketplace orders while linking new requests to an activity.
alter table private.site_material_needs
 add column if not exists activity_index integer check (activity_index is null or activity_index >= 0);

CREATE OR REPLACE FUNCTION public.project_stage_activity_material_batch(p_org uuid, p_project uuid, p_stage uuid, p_items jsonb, p_activity_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_item jsonb;v_id uuid;v_qty numeric;v_unit text;v_total integer:=0;
begin
 if not private.site_access(p_org,p_project) or
    not private.site_allowed(p_org,p_project,array['manager','site_engineer','procurement'])
 then raise exception 'Project material access denied' using errcode='42501';end if;
 if (select stage from private.site_state where organization_id=p_org and project_id=p_project)
   is distinct from 'execution' then
  raise exception 'Activate construction before requesting materials' using errcode='42501';end if;
 if not exists(select 1 from private.construction_project_stages
    where organization_id=p_org and project_id=p_project and id=p_stage) then
  raise exception 'Construction stage unavailable' using errcode='22023';end if;
 if p_activity_index is null or p_activity_index < 0 or not exists (
    select 1 from private.construction_project_stages s
    where s.organization_id=p_org and s.project_id=p_project and s.id=p_stage
      and p_activity_index < jsonb_array_length(coalesce(s.activities,'[]'::jsonb))
  ) then raise exception 'Work item does not belong to this stage' using errcode='22023'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 12
   or octet_length(p_items::text)>12000 then
  raise exception 'Choose between 1 and 12 materials' using errcode='22023';end if;
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item) is distinct from 'object'
    or (v_item-array['item','quantity','unit','notes'])<>'{}'::jsonb
    or length(trim(coalesce(v_item->>'item',''))) not between 2 and 200
    or length(coalesce(v_item->>'notes',''))>3000
    or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,3})?$'
  then raise exception 'Invalid material request line' using errcode='22023';end if;
  v_qty=(v_item->>'quantity')::numeric;
  v_unit=v_item->>'unit';
  if v_qty<=0 or v_qty>100000000 or v_unit not in
   ('bags','kg','tonnes','litres','nos','sqft','sqm','cft','cum','yards','metres','feet')
  then raise exception 'Invalid quantity or unit' using errcode='22023';end if;
  insert into private.site_material_needs(
    organization_id,project_id,item,quantity,unit,notes,requested_by,activity_index)
   values(p_org,p_project,trim(v_item->>'item'),v_qty,v_unit,
    coalesce(v_item->>'notes',''),auth.uid(),p_activity_index) returning id into v_id;
  insert into private.construction_stage_record_links(
    organization_id,project_id,stage_id,record_kind,material_id,linked_by)
   values(p_org,p_project,p_stage,'material',v_id,auth.uid());
  perform private.site_log(p_org,p_project,'material.requested',v_id);
  v_total=v_total+1;
 end loop;
 return jsonb_build_object('count',v_total,'stage_id',p_stage);
end
$function$;
revoke all on function public.project_stage_activity_material_batch(uuid,uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.project_stage_activity_material_batch(uuid,uuid,uuid,jsonb,integer) to authenticated;
