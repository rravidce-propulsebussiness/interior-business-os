-- Preserve inbound WhatsApp Cloud API message payloads that are not plain text
-- so the inbox can render locations, contacts, stickers, replies, orders,
-- reactions, and message types added later by Meta.
begin;

create or replace function public.whatsapp_message_ingest(
  p_organization_id uuid, p_connection_id uuid, p_change jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  value jsonb;
  m jsonb;
  s jsonb;
  payload jsonb;
  wa text;
  msg_id text;
  contact_id uuid;
  profile_name text;
  body text;
  msg_type text;
  marker_type text;
  media_id text;
  at_time timestamptz;
  count_added integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.whatsapp_business_connections c
    where c.organization_id=p_organization_id
      and c.id=p_connection_id
      and c.status='connected'
  ) then
    raise exception 'Connection not found' using errcode='P0002';
  end if;

  value := coalesce(p_change->'value','{}'::jsonb);
  for m in
    select e.value
    from jsonb_array_elements(coalesce(value->'messages','[]'::jsonb)) as e(value)
  loop
    wa := m->>'from';
    msg_id := m->>'id';
    msg_type := coalesce(m->>'type','unknown');
    marker_type := regexp_replace(lower(left(msg_type,40)),'[^a-z_]','','g');
    if marker_type = '' then marker_type := 'unknown'; end if;
    if wa !~ '^[0-9]{5,32}$' or coalesce(msg_id,'')='' then
      continue;
    end if;

    select coalesce(c.value->'profile'->>'name','')
    into profile_name
    from jsonb_array_elements(coalesce(value->'contacts','[]'::jsonb)) as c(value)
    where c.value->>'wa_id'=wa
    limit 1;

    media_id := case
      when msg_type in ('image','video','audio','document','sticker')
        then coalesce(m->msg_type->>'id','')
      else ''
    end;

    if media_id <> '' then
      body := '[[WA_MEDIA:' || media_id || ':' || msg_type || ']]'
        || case
          when coalesce(
            nullif(m->msg_type->>'caption',''),
            nullif(m->msg_type->>'filename','')
          ) is not null
            then chr(10) || coalesce(
              nullif(m->msg_type->>'caption',''),
              m->msg_type->>'filename'
            )
          else ''
        end;
    elsif msg_type = 'text' then
      body := coalesce(m->'text'->>'body','[text message]');
    elsif msg_type = 'unsupported' then
      -- Meta does not include the original content for this message type.
      body := '[unsupported message]';
    else
      payload := m - 'id' - 'from' - 'timestamp' - 'context';
      if payload - 'type' = '{}'::jsonb then
        body := '[' || msg_type || ' message]';
      else
        body := '[[WA_JSON:' || marker_type || ']]' || chr(10) || payload::text;
      end if;
    end if;

    at_time := to_timestamp(
      coalesce(nullif(m->>'timestamp','')::double precision, extract(epoch from now()))
    );

    insert into public.whatsapp_contacts(
      organization_id,connection_id,wa_id,display_name,last_message_at,updated_at
    )
    values(p_organization_id,p_connection_id,wa,coalesce(profile_name,''),at_time,now())
    on conflict(organization_id,connection_id,wa_id) do update set
      display_name = case
        when excluded.display_name <> '' then excluded.display_name
        else whatsapp_contacts.display_name
      end,
      last_message_at = greatest(whatsapp_contacts.last_message_at,excluded.last_message_at),
      updated_at = now()
    returning id into contact_id;

    insert into public.whatsapp_messages(
      organization_id,connection_id,contact_id,provider_message_id,direction,
      message_type,body,status,occurred_at
    )
    values(
      p_organization_id,p_connection_id,contact_id,msg_id,'inbound',
      msg_type,body,'received',at_time
    )
    on conflict(connection_id,provider_message_id) do nothing;
    if found then
      count_added := count_added + 1;
    end if;
  end loop;

  for s in
    select e.value
    from jsonb_array_elements(coalesce(value->'statuses','[]'::jsonb)) as e(value)
  loop
    update public.whatsapp_messages
    set status = case
          when s->>'status' in ('sent','delivered','read','failed')
            then s->>'status'
          else status
        end,
        error_code = coalesce(s->'errors'->0->>'code',''),
        occurred_at = greatest(
          occurred_at,
          to_timestamp(coalesce(nullif(s->>'timestamp','')::double precision,extract(epoch from now())))
        )
    where connection_id=p_connection_id
      and provider_message_id=s->>'id'
      and direction='outbound';
  end loop;

  return count_added;
end $$;

-- Recover structured payloads for recent historical messages while their
-- original signed webhook event is still inside the event retention window.
with raw_messages as (
  select
    e.organization_id,
    e.waba_id,
    item.value as message,
    item.value->>'id' as provider_message_id,
    coalesce(item.value->>'type','unknown') as message_type
  from public.whatsapp_webhook_events e
  cross join lateral jsonb_array_elements(
    coalesce(e.payload->'change'->'value'->'messages','[]'::jsonb)
  ) item(value)
  where e.expires_at > now()
), normalized as (
  select
    raw_messages.organization_id,
    raw_messages.waba_id,
    raw_messages.provider_message_id,
    raw_messages.message_type,
    case
      when raw_messages.message_type in ('image','video','audio','document','sticker')
        and coalesce(raw_messages.message->raw_messages.message_type->>'id','') <> ''
        then '[[WA_MEDIA:' || (raw_messages.message->raw_messages.message_type->>'id')
          || ':' || raw_messages.message_type || ']]'
          || case
            when coalesce(
              nullif(raw_messages.message->raw_messages.message_type->>'caption',''),
              nullif(raw_messages.message->raw_messages.message_type->>'filename','')
            ) is not null
              then chr(10) || coalesce(
                nullif(raw_messages.message->raw_messages.message_type->>'caption',''),
                raw_messages.message->raw_messages.message_type->>'filename'
              )
            else ''
          end
      when raw_messages.message_type = 'text'
        then coalesce(raw_messages.message->'text'->>'body','[text message]')
      when raw_messages.message_type = 'unsupported'
        then '[unsupported message]'
      when (raw_messages.message - 'id' - 'from' - 'timestamp' - 'context') - 'type'
        = '{}'::jsonb
        then '[' || raw_messages.message_type || ' message]'
      else '[[WA_JSON:' || coalesce(
          nullif(regexp_replace(lower(left(raw_messages.message_type,40)),'[^a-z_]','','g'),''),
          'unknown'
        ) || ']]'
        || chr(10)
        || (raw_messages.message - 'id' - 'from' - 'timestamp' - 'context')::text
    end as body
  from raw_messages
  where coalesce(raw_messages.provider_message_id,'') <> ''
)
update public.whatsapp_messages stored
set body = normalized.body
from normalized
join public.whatsapp_business_connections conn
  on conn.organization_id=normalized.organization_id
  and conn.waba_id=normalized.waba_id
where stored.organization_id=normalized.organization_id
  and stored.connection_id=conn.id
  and stored.provider_message_id=normalized.provider_message_id
  and stored.body = ('[' || normalized.message_type || ' message]');

commit;
