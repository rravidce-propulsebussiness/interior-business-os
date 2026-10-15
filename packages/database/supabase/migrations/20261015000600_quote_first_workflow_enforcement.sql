-- Quote-first policy: block the legacy manually supplied construction workflow.
-- A contract built from an approved/issued revision is the only stage source.
-- The canonical quote-based project_quote_timeline_create RPC writes its stages
-- directly and is unaffected. Existing workflows/data are preserved.
begin;

-- Move the former handler outside PostgREST's exposed public schema, retaining
-- all existing role/task authorization and audit behavior.
alter function public.construction_project_command(uuid,uuid,text,jsonb)
  set schema private;
alter function private.construction_project_command(uuid,uuid,text,jsonb)
  rename to construction_project_command_internal;
revoke all on function private.construction_project_command_internal(uuid,uuid,text,jsonb)
  from public, anon, authenticated;

create function public.construction_project_command(
  p_organization_id uuid,
  p_project_id uuid,
  p_action text,
  p_input jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_action='workflow_create' then
    raise exception
      'Stages must come from the accepted quotation and agreement; use project_quote_timeline_create'
      using errcode='42501';
  end if;
  return private.construction_project_command_internal(
    p_organization_id, p_project_id, p_action, p_input
  );
end$$;

revoke all on function public.construction_project_command(uuid,uuid,text,jsonb)
  from public, anon;
grant execute on function public.construction_project_command(uuid,uuid,text,jsonb)
  to authenticated;
commit;
