-- Read-only WhatsApp RPCs must not call the locking permission helper.
do $$
declare
  fn regprocedure;
  definition text;
  volatility "char";
begin
  foreach fn in array array[
    'public.whatsapp_workspace_read(uuid,text,uuid,text,text,integer)'::regprocedure,
    'public.whatsapp_window_open(uuid,uuid,text)'::regprocedure,
    'public.whatsapp_contact_opted_out(uuid,uuid,text)'::regprocedure
  ] loop
    select p.provolatile, pg_get_functiondef(p.oid)
      into volatility, definition
      from pg_proc p where p.oid = fn::oid;
    if volatility <> 's' then
      raise exception '% must remain a STABLE read function', fn;
    end if;
    if position('private.require_permission' in definition) > 0 then
      raise exception '% uses the locking permission helper', fn;
    end if;
    if position('private.has_permission' in definition) = 0 then
      raise exception '% is missing its read-only permission check', fn;
    end if;
  end loop;
  definition := pg_get_functiondef(
    'public.whatsapp_workspace_read(uuid,text,uuid,text,text,integer)'::regprocedure
  );
  if length(definition) - length(replace(definition, 'p_section <> ''inbox''', '')) < 2 then
    raise exception 'Inbox must omit manually saved contacts without conversations';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.whatsapp_contact_save(uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated members must be able to save WhatsApp contacts';
  end if;
end $$;
