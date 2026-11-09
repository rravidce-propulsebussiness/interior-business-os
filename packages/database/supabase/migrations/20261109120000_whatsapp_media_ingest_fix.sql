-- Fix inbound WhatsApp media ingest.
-- The previous body concatenated the caption without parentheses, which made
-- PostgreSQL resolve `text -> text` and raise for every image, video, audio
-- or document message, so Meta webhooks for media were never stored.
-- Documents without a caption now use their file name as the caption line.
begin;

create or replace function public.whatsapp_message_ingest(
  p_organization_id uuid, p_connection_id uuid, p_change jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  value jsonb;
  m jsonb;
  s jsonb;
  wa text;
  msg_id text;
  contact_id uuid;
  profile_name text;
  body text;
  msg_type text;
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
    if wa !~ '^[0-9]{5,32}$' or coalesce(msg_id,'')='' then
      continue;
    end if;

    select coalesce(c.value->'profile'->>'name','')
    into profile_name
    from jsonb_array_elements(coalesce(value->'contacts','[]'::jsonb)) as c(value)
    where c.value->>'wa_id'=wa
    limit 1;

    media_id := case
      when msg_type in ('image','video','audio','document')
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
            -- Parentheses are required: ||, -> and ->> share one precedence
            -- level and associate left, so `chr(10) || m->...` parsed as
            -- `(chr(10) || m) -> ...` and every media message failed.
            then chr(10) || (
              coalesce(
                nullif(m->msg_type->>'caption',''),
                m->msg_type->>'filename'
              )
            )
          else ''
        end;
    else
      body := coalesce(
        m->'text'->>'body',
        m->'button'->>'text',
        m->'interactive'->'button_reply'->>'title',
        m->'interactive'->'list_reply'->>'title',
        '[' || msg_type || ' message]'
      );
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
      msg_type,left(body,4000),'received',at_time
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

commit;
