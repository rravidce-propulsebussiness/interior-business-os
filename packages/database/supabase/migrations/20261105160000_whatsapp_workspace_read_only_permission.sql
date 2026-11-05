begin;

-- Read-only workspace RPCs run inside PostgREST read-only transactions. The
-- general permission helper locks the organization row, so use its read-only
-- predicate here instead.
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef(
    'public.whatsapp_workspace_read(uuid,text,uuid,text,text,integer)'::regprocedure
  );

  definition := replace(
    definition,
    'perform private.require_permission(p_organization_id, ''automation.view'');',
    'if not private.has_permission(p_organization_id, ''automation.view'') then raise exception ''Forbidden'' using errcode=''42501''; end if;'
  );

  if position('private.require_permission' in definition) > 0 then
    raise exception 'Could not replace the locking WhatsApp read permission check';
  end if;

  if position('private.has_permission(p_organization_id' in definition) = 0 then
    raise exception 'WhatsApp read permission check is missing';
  end if;

  execute definition;
end $$;

commit;
