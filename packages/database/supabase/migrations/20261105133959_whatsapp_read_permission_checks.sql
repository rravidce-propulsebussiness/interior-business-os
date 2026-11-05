begin;

-- Read RPCs run in PostgREST read-only transactions. The general permission
-- helper locks the organization row, which is not allowed in a read-only
-- transaction. Keep these checks read-only by using has_permission directly.
do $$
declare
  fn regprocedure;
  definition text;
  new_check text;
begin
  foreach fn in array array[
    'public.whatsapp_workspace_read(uuid,text,uuid,text,text,integer)'::regprocedure,
    'public.whatsapp_window_open(uuid,uuid,text)'::regprocedure,
    'public.whatsapp_contact_opted_out(uuid,uuid,text)'::regprocedure
  ] loop
    definition := pg_get_functiondef(fn);
    new_check := case
      when fn::text like '%whatsapp_contact_opted_out%' then
        'if not private.has_permission(p_organization_id,''automation.manage'') then raise exception ''Forbidden'' using errcode=''42501''; end if;'
      else
        'if not private.has_permission(p_organization_id,''automation.view'') then raise exception ''Forbidden'' using errcode=''42501''; end if;'
    end;
    if fn::text like '%whatsapp_contact_opted_out%' then
      definition := regexp_replace(definition,
        'perform private\.require_permission\(p_organization_id,\s*''automation\.manage''\);', new_check);
    else
      definition := regexp_replace(definition,
        'perform private\.require_permission\(p_organization_id,\s*''automation\.view''\);', new_check);
    end if;
    if position('perform private.require_permission' in definition) > 0 then
      raise exception 'Expected permission check was not found in %', fn;
    end if;
    execute definition;
  end loop;
end $$;

commit;
