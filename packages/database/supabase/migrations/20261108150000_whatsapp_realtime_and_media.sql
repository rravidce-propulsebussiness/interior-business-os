begin;

create or replace function public.whatsapp_realtime_allowed(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and private.has_permission(p_organization_id, 'automation.view', null::uuid);
$$;

revoke all on function public.whatsapp_realtime_allowed(uuid) from public, anon;
grant execute on function public.whatsapp_realtime_allowed(uuid) to authenticated;

grant select on public.whatsapp_contacts, public.whatsapp_messages to authenticated;

drop policy if exists whatsapp_contacts_realtime_select on public.whatsapp_contacts;
create policy whatsapp_contacts_realtime_select
  on public.whatsapp_contacts
  for select to authenticated
  using (public.whatsapp_realtime_allowed(organization_id));

drop policy if exists whatsapp_messages_realtime_select on public.whatsapp_messages;
create policy whatsapp_messages_realtime_select
  on public.whatsapp_messages
  for select to authenticated
  using (public.whatsapp_realtime_allowed(organization_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_contacts'
  ) then
    execute 'alter publication supabase_realtime add table public.whatsapp_contacts';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.whatsapp_messages';
  end if;
end $$;

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
          when coalesce(m->msg_type->>'caption','') <> ''
            then E'\\n' || m->msg_type->>'caption'
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
