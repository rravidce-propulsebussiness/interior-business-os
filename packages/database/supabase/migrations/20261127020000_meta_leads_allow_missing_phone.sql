begin;

-- Meta test leads and some real forms can omit a phone field. Keep those
-- enquiries visible in CRM; WhatsApp remains disabled because wa_id is null.
do $$
declare
  v_definition text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef('public.meta_lead_ingest(uuid,uuid,text,jsonb)'::regprocedure)
    into v_definition;

  v_before := $old$if not private.entitled(p_organization_id, 'crm') then
    v_error := 'CRM is not enabled for this company';
  elsif v_phone is null or v_phone !~ '^\+?[0-9]{7,15}$' then
    v_error := 'The lead form did not include a valid phone number';
  elsif length(v_email) > 254 or (v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    v_email := '';
  end if;$old$;
  v_after := $new$if not private.entitled(p_organization_id, 'crm') then
    v_error := 'CRM is not enabled for this company';
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9]{7,15}$' then
    v_phone := 'Not provided';
    v_wa := null;
  end if;
  if length(v_email) > 254 or (v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    v_email := '';
  end if;$new$;
  if strpos(v_definition, v_before) = 0 then
    raise exception 'meta_lead_ingest phone validation changed unexpectedly';
  end if;
  v_definition := replace(v_definition, v_before, v_after);

  v_before := $old$and (phone_normalized = v_phone or (v_email <> '' and email_normalized = v_email))$old$;
  v_after := $new$and ((v_phone <> 'Not provided' and phone_normalized = v_phone)
          or (v_email <> '' and email_normalized = v_email))$new$;
  if strpos(v_definition, v_before) = 0 then
    raise exception 'meta_lead_ingest duplicate matching changed unexpectedly';
  end if;
  execute replace(v_definition, v_before, v_after);
end $$;

revoke all on function public.meta_lead_ingest(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.meta_lead_ingest(uuid,uuid,text,jsonb) to service_role;

commit;
