-- The company owner may let site work proceed before the design advance is
-- recorded (cash handed over offline, client paying later, ...). Until now a
-- recorded receipt was the only way to clear the advance gate, so a project
-- stayed locked even when the owner had decided to proceed.
-- The waiver is owner-only, needs a reason, is logged, and never creates a
-- receipt: the payment milestone stays pending in Finance.
begin;

alter table private.project_advance_requirements
  add column if not exists waived_by uuid references public.profiles(id),
  add column if not exists waived_at timestamptz,
  add column if not exists waiver_reason text;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_advance_requirements_waiver_reason_check'
  ) then
    alter table private.project_advance_requirements
      add constraint project_advance_requirements_waiver_reason_check
      check (
        (waived_at is null and waiver_reason is null and waived_by is null)
        or (waived_at is not null and length(waiver_reason) between 10 and 1000)
      );
  end if;
end
$constraint$;

-- A waived requirement no longer needs a recorded receipt.
do $patch$
declare
  definition text;
  old_rule text := $r$where req.organization_id=c.organization_id and req.contract_id=c.id)$r$;
  new_rule text := $r$where req.organization_id=c.organization_id and req.contract_id=c.id
           and req.waived_at is null)$r$;
begin
  select pg_get_functiondef('private.project_agreement_authorized(uuid,uuid)'::regprocedure)
    into definition;
  if position(new_rule in definition) > 0 then
    return;
  end if;
  if position(old_rule in definition) = 0 then
    raise exception 'Unexpected agreement advance rule';
  end if;
  execute replace(definition, old_rule, new_rule);
end
$patch$;

-- Expose the waiver to the project workspace.
do $patch$
declare
  definition text;
  anchor text := $r$'execution_authorized',$r$;
  waived text := $r$'advance_waived',c.id is not null and exists(
       select 1 from private.project_advance_requirements req
       where req.organization_id=p_organization_id and req.contract_id=c.id
         and req.waived_at is not null),
   'execution_authorized',$r$;
begin
  select pg_get_functiondef('public.project_agreement_read(uuid,uuid)'::regprocedure)
    into definition;
  if position($r$'advance_waived'$r$ in definition) > 0 then
    return;
  end if;
  if position(anchor in definition) = 0 then
    raise exception 'Unexpected agreement read shape';
  end if;
  execute replace(definition, anchor, waived);
end
$patch$;

create or replace function public.project_advance_waive(
  p_organization_id uuid,
  p_project_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_contract uuid;
  v_count integer;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not coalesce(private.site_owner(p_organization_id), false) then
    raise exception 'Only the company owner can waive the advance payment'
      using errcode = '42501';
  end if;
  if length(v_reason) not between 10 and 1000 then
    raise exception 'Record why the advance is waived (minimum ten characters)'
      using errcode = '22023';
  end if;
  select c.id into v_contract
    from public.contracts c
   where c.organization_id = p_organization_id
     and c.project_id = p_project_id
     and c.status = 'active'
   order by c.accepted_at desc nulls last, c.id desc
   limit 1;
  if v_contract is null then
    raise exception 'An active contract is required before waiving the advance'
      using errcode = '23514';
  end if;
  update private.project_advance_requirements
     set waived_by = auth.uid(), waived_at = now(), waiver_reason = v_reason
   where organization_id = p_organization_id
     and contract_id = v_contract
     and waived_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.site_log(p_organization_id, p_project_id, 'advance.waived_by_owner', v_contract);
  end if;
  return jsonb_build_object('contract_id', v_contract, 'waived', v_count);
end
$function$;

revoke all on function public.project_advance_waive(uuid, uuid, text) from public, anon;
grant execute on function public.project_advance_waive(uuid, uuid, text) to authenticated;

commit;
