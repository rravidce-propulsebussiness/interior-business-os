-- A Meta delivery webhook may arrive before the Send API has persisted the
-- provider message ID. Reconcile the first verification receipt against the
-- already stored, signed webhook event instead of retrying an accepted send.
begin;

create index if not exists whatsapp_webhook_events_waba_recent
  on public.whatsapp_webhook_events(organization_id, waba_id, received_at desc);

create or replace function public.whatsapp_broadcast_probe_reconcile(
  p_organization_id uuid, p_connection_id uuid, p_provider_message_id text
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare selected_waba text;
declare evt record;
declare receipt jsonb;
declare delivery text;
declare code text;
declare matched integer := 0;
begin
  if p_provider_message_id is null
    or length(p_provider_message_id) not between 5 and 255
  then return 0; end if;

  select c.waba_id into selected_waba
  from public.whatsapp_business_connections c
  where c.organization_id = p_organization_id and c.id = p_connection_id
    and c.status = 'connected';
  if selected_waba is null then return 0; end if;

  -- This is a bounded backfill for the just-submitted verification message,
  -- never a background scan of all historical WhatsApp status events.
  for evt in
    select e.payload->'change'->'value'->'statuses' as statuses
    from public.whatsapp_webhook_events e
    where e.organization_id = p_organization_id
      and e.waba_id = selected_waba
      and e.received_at > now() - interval '15 minutes'
      and e.payload @> jsonb_build_object(
        'change', jsonb_build_object(
          'value', jsonb_build_object(
            'statuses', jsonb_build_array(
              jsonb_build_object('id', p_provider_message_id)
            )
          )
        )
      )
    order by e.received_at, e.id
    limit 100
  loop
    for receipt in
      select item.value
      from jsonb_array_elements(coalesce(evt.statuses,'[]'::jsonb)) item(value)
      where item.value->>'id' = p_provider_message_id
    loop
      delivery := receipt->>'status';
      if delivery not in ('sent','delivered','read','failed') then continue; end if;
      code := coalesce(receipt->'errors'->0->>'code', '');
      if code !~ '^[0-9]{3,6}$' then code := ''; end if;
      perform public.whatsapp_broadcast_receipt(
        p_organization_id, p_connection_id,
        p_provider_message_id, delivery, code
      );
      -- The original receipt may have preceded outbound inbox logging.
      update public.whatsapp_messages m
      set status = delivery,
          error_code = case when delivery = 'failed' then code else '' end
      where m.organization_id = p_organization_id
        and m.connection_id = p_connection_id
        and m.provider_message_id = p_provider_message_id
        and m.direction = 'outbound'
        and m.status not in ('delivered','read');
      matched := matched + 1;
    end loop;
  end loop;
  return matched;
end;
$$;

revoke all on function public.whatsapp_broadcast_probe_reconcile(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_probe_reconcile(uuid,uuid,text)
  to service_role;

commit;
