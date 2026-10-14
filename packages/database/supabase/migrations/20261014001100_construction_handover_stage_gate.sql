-- Construction Execution OS Phase 10: enforce current floor-stage and ancestor
-- quality clearances at the existing Site Delivery handover transition.
-- The original site/Operations handover checks remain in force.
begin;

-- A descendant certificate must no longer be treated as current when any
-- prerequisite was reopened, failed reinspection, or lost contract clearance.
-- Closure is project-scoped, including stages on other configured floors.
create function private.construction_stage_chain_current(
 p_org uuid,p_project uuid,p_stage uuid
) returns boolean language sql stable security definer set search_path='' as $$
 with recursive required_stages(id) as (
   select p_stage
   union
   select d.predecessor_id
   from private.construction_stage_dependencies d
   join required_stages chain on chain.id=d.stage_id
   where d.organization_id=p_org and d.project_id=p_project
 )
 select not exists (
   select 1 from required_stages required
   where not private.construction_stage_current(p_org,p_project,required.id)
 );
$$;

-- The checked site command already requires resolved informal checks,
-- materials, formal Operations inspections, snags, tasks and documents.
-- This trigger adds the separate floor-wise construction certificate gate
-- at the actual persistence boundary (not merely in the React UI).
-- Projects without a construction workflow keep the existing behavior.
create function private.construction_site_handover_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.stage='handover' and old.stage is distinct from 'handover'
    and exists (
      select 1 from private.construction_project_workflows w
      where w.organization_id=new.organization_id
        and w.project_id=new.project_id
    )
 then
   if exists (
     select 1 from private.construction_project_workflows w
     where w.organization_id=new.organization_id
       and w.project_id=new.project_id and w.status<>'frozen'
   ) then
     raise exception 'Freeze the approved construction workflow before handover'
       using errcode='23514';
   end if;
   if not exists (
     select 1 from private.construction_project_stages s
     where s.organization_id=new.organization_id
       and s.project_id=new.project_id
   ) then
     raise exception 'Construction workflow has no stages to certify'
       using errcode='23514';
   end if;
   if exists (
     select 1 from private.construction_project_stages s
     where s.organization_id=new.organization_id
       and s.project_id=new.project_id
       and not private.construction_stage_chain_current(
         new.organization_id,new.project_id,s.id)
   ) then
     raise exception 'All construction floor stages and prerequisites require current independent quality clearance before handover'
       using errcode='23514';
   end if;
 end if;
 return new;
end$$;

create trigger construction_site_handover_stage_gate
before update of stage on private.site_state
for each row execute function private.construction_site_handover_guard();

revoke all on function private.construction_stage_chain_current(uuid,uuid,uuid),
 private.construction_site_handover_guard()
 from public,anon,authenticated;

commit;
