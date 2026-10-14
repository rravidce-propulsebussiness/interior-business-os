-- Phase 11: prevent the canonical Operations handover path from bypassing
-- the same floor/zone construction certifications required by Site Delivery.
-- Additive only: no updates to historic handovers, contracts, finance, or sites.
-- Depends on 20261014001100_construction_handover_stage_gate.sql.
begin;

-- Projects which have not adopted a construction workflow retain the existing
-- Operations behavior. A configured construction project must have one frozen
-- workflow and at least one stage; every stage and its transitive dependencies
-- must hold a CURRENT independent certification at the time of transition.
create function private.construction_operations_handover_ready(
  p_org uuid, p_project uuid
) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists (
    select 1 from private.construction_project_workflows w
    where w.organization_id = p_org and w.project_id = p_project
  ) or (
    exists (
      select 1 from private.construction_project_workflows w
      where w.organization_id = p_org and w.project_id = p_project
        and w.status = 'frozen'
    )
    and exists (
      select 1 from private.construction_project_stages s
      where s.organization_id = p_org and s.project_id = p_project
    )
    and not exists (
      select 1 from private.construction_project_stages s
      where s.organization_id = p_org and s.project_id = p_project
        and not coalesce(
          private.construction_stage_chain_current(p_org, p_project, s.id),
          false
        )
    )
  );
$$;

-- Both the normal operations_plan status command and the handover command's
-- direct UPDATE of execution_plans are protected by this persistence guard.
-- Do not change the existing Site Delivery handover trigger.
create function private.construction_operations_plan_handover_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('ready_for_handover', 'handed_over', 'completed')
    and not private.construction_operations_handover_ready(
      new.organization_id, new.project_id
    )
  then
    raise exception 'Current construction stage and prerequisite certifications required for Operations handover'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger construction_operations_plan_handover_gate
before update of status on public.execution_plans
for each row when (old.status is distinct from new.status)
execute function private.construction_operations_plan_handover_guard();

-- The canonical approval updates the handover document BEFORE it updates
-- the execution plan. Guard the approval itself to avoid minting a certified
-- handover document if the underlying construction stages are not current.
create function private.construction_operations_record_handover_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status = 'approved'
    and not private.construction_operations_handover_ready(
      new.organization_id, new.project_id
    )
  then
    raise exception 'Cannot approve Operations handover while construction floor stages or prerequisites are uncertified'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger construction_operations_record_handover_gate
before update of status on public.handover_records
for each row when (old.status is distinct from new.status)
execute function private.construction_operations_record_handover_guard();

revoke all on function private.construction_operations_handover_ready(uuid, uuid),
  private.construction_operations_plan_handover_guard(),
  private.construction_operations_record_handover_guard()
from public, anon, authenticated;

commit;
