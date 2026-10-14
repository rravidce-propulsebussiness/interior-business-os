-- Phase 11: align persisted workflow status with the existing atomic
-- manager-authorized workflow_create command. The command writes an immutable
-- stage/dependency snapshot in one transaction, but previously left the
-- workflow record in "planning", making both handover guards impossible to pass.
-- This file contains no change to finance/customer/project/approval snapshots.
begin;

create function private.construction_freeze_created_workflow()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- All stages belong to the same already-validated command transaction.
  -- A later stage/dependency error rolls back this update with the command.
  update private.construction_project_workflows w
    set status='frozen',version=w.version+1
    where w.organization_id=new.organization_id
      and w.project_id=new.project_id
      and w.id=new.workflow_id
      and w.status='planning';
  return new;
end;
$$;

create trigger construction_freeze_on_stage_creation
after insert on private.construction_project_stages
for each row
execute function private.construction_freeze_created_workflow();

-- Historical planning statuses were produced by the same single-transaction
-- manager command. Freeze only workflows that already have persisted stages.
-- Do not touch stage definitions, approval history, finance, or incomplete rows.
update private.construction_project_workflows w
set status='frozen',version=w.version+1
where w.status='planning'
  and exists (
    select 1 from private.construction_project_stages s
    where s.organization_id=w.organization_id
      and s.project_id=w.project_id
      and s.workflow_id=w.id
  );

revoke all on function private.construction_freeze_created_workflow()
from public, anon, authenticated;
commit;
