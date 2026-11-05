begin;

do $$
declare
  definition text;
  needle text;
  replacement text;
  filter_clause text := 'and (p_section <> ''inbox'' or exists(select 1 from public.whatsapp_messages wm where wm.organization_id=c.organization_id and wm.contact_id=c.id))';
begin
  definition := pg_get_functiondef(
    'public.whatsapp_workspace_read(uuid,text,uuid,text,text,integer)'::regprocedure
  );

  needle := $needle$and (p_connection_id is null or c.connection_id=p_connection_id)
          and (p_search=$needle$;
  replacement := $replacement$and (p_connection_id is null or c.connection_id=p_connection_id)
          $replacement$ || filter_clause || E'\n          and (p_search=';
  definition := replace(definition, needle, replacement);

  needle := $needle$and (p_connection_id is null or c.connection_id=p_connection_id)
        and (p_search=$needle$;
  replacement := $replacement$and (p_connection_id is null or c.connection_id=p_connection_id)
        $replacement$ || filter_clause || E'\n        and (p_search=';
  definition := replace(definition, needle, replacement);

  if position('p_section <> ''inbox''' in definition) = 0 then
    raise exception 'Could not add WhatsApp inbox conversation filtering';
  end if;
  execute definition;
end $$;

commit;
