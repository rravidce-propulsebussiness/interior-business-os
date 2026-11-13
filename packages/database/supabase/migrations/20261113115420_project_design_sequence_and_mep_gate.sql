-- Keep construction design progress in the order the homeowner expects:
-- floor plan -> structural -> 3D elevation -> MEP. The existing site_designs
-- and client decision records remain canonical; no second design workflow is
-- added. Direct WhatsApp/offline shares are recorded as references on those
-- same revisioned design records.
begin;

create or replace function private.site_design_sequence_guard()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare
  required_kind text;
  current_status text;
  homeowner_approved_at timestamptz;
begin
  required_kind := case new.kind
    when 'structural_design' then private.project_floor_plan_kind(new.organization_id,new.project_id)
    when '3d_design' then 'structural_design'
    when 'electrical_plan' then '3d_design'
    when 'plumbing_plan' then '3d_design'
    else null
  end;
  if required_kind is null then return new; end if;

  select d.status,d.client_approved_at into current_status,homeowner_approved_at
    from private.site_designs d
   where d.organization_id=new.organization_id and d.project_id=new.project_id
     and d.kind=required_kind
   order by d.revision desc limit 1;
  if current_status is distinct from 'approved' or homeowner_approved_at is null then
    raise exception 'The latest % must be technically reviewed and homeowner-approved before % starts',
      replace(required_kind,'_',' '),replace(new.kind,'_',' ')
      using errcode='23514';
  end if;
  return new;
end
$f$;

-- Construction requires five ordered plan types. Interiors retain their
-- existing two-plan rule. Guard both staff-recorded and verified-portal final
-- decisions so an app-only check cannot release site execution early.
do $patch$
declare definition text; old_guard text; new_guard text;
begin
  select pg_get_functiondef(
    'public.project_site_command(uuid,uuid,text,jsonb)'::regprocedure
  ) into definition;
  old_guard := $before$else array['architectural_plan','3d_design','structural_design']::text[] end$before$;
  new_guard := $after$else array['architectural_plan','structural_design','3d_design','electrical_plan','plumbing_plan']::text[] end$after$;
  if definition is null or position(old_guard in definition)=0 then
    raise exception 'Unexpected project_site_command design gate';
  end if;
  execute replace(definition,old_guard,new_guard);

  select pg_get_functiondef(
    'public.client_portal_design_decide(uuid,text,text,text)'::regprocedure
  ) into definition;
  old_guard := $before$else array['architectural_plan','3d_design','structural_design']::text[] end$before$;
  new_guard := $after$else array['architectural_plan','structural_design','3d_design','electrical_plan','plumbing_plan']::text[] end$after$;
  if definition is null or position(old_guard in definition)=0 then
    raise exception 'Unexpected client_portal_design_decide design gate';
  end if;
  execute replace(definition,old_guard,new_guard);
end
$patch$;

commit;
