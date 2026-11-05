begin;

alter table public.whatsapp_contacts
  add column template_opted_in_at timestamptz,
  add column template_opt_in_source text not null default '',
  add column template_opt_in_recorded_by uuid references public.profiles(id) on delete set null,
  add constraint whatsapp_contacts_opt_in_source_length
    check (length(template_opt_in_source) <= 200);

create index whatsapp_contacts_template_opt_in
  on public.whatsapp_contacts (organization_id, connection_id, template_opted_in_at)
  where template_opted_in_at is not null and opted_out_at is null;

create or replace function public.whatsapp_workspace_read(
  p_organization_id uuid,
  p_section text default 'inbox',
  p_connection_id uuid default null,
  p_wa_id text default null,
  p_search text default '',
  p_page integer default 1
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_permission(p_organization_id, 'automation.view');
  if p_section not in ('inbox','contacts','thread','automations') or p_page not between 1 and 10000 then
    raise exception 'Invalid WhatsApp workspace query' using errcode = '22023';
  end if;

  if p_section = 'thread' then
    if p_wa_id !~ '^[0-9]{5,32}$' then raise exception 'Invalid contact' using errcode = '22023'; end if;
    select jsonb_build_object(
      'contact', (select jsonb_build_object('id', c.id, 'wa_id', c.wa_id, 'name', c.display_name,
        'opted_out', c.opted_out_at is not null, 'template_opted_in_at', c.template_opted_in_at, 'template_opt_in_source', c.template_opt_in_source, 'last_message_at', c.last_message_at)
        from public.whatsapp_contacts c where c.organization_id=p_organization_id and c.wa_id=p_wa_id
          and (p_connection_id is null or c.connection_id=p_connection_id)
        order by c.last_message_at desc limit 1),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'provider_id',m.provider_message_id,
        'direction',m.direction,'type',m.message_type,'body',m.body,'status',m.status,
        'error_code',m.error_code,'occurred_at',m.occurred_at) order by m.occurred_at asc)
        from (select m.* from public.whatsapp_messages m join public.whatsapp_contacts c
          on c.organization_id=m.organization_id and c.id=m.contact_id
          where m.organization_id=p_organization_id and c.wa_id=p_wa_id
            and (p_connection_id is null or c.connection_id=p_connection_id)
          order by m.occurred_at desc limit 100) m), '[]'::jsonb)
    ) into result;
  elsif p_section = 'automations' then
    select jsonb_build_object('rows', coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'version',r.version,'connection_id',r.connection_id,'name',r.name,
      'trigger_type',r.trigger_type,'keyword',r.keyword,'reply_text',r.reply_text,
      'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at
    ) order by r.updated_at desc), '[]'::jsonb))
    into result from public.whatsapp_automation_rules r
    where r.organization_id=p_organization_id and (p_connection_id is null or r.connection_id=p_connection_id);
  else
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'wa_id', c.wa_id, 'name', c.display_name, 'opted_out', c.opted_out_at is not null,
        'template_opted_in_at', c.template_opted_in_at, 'template_opt_in_source', c.template_opt_in_source,
        'last_message_at', c.last_message_at, 'last_read_at', c.last_read_at,
        'unread', coalesce(last_in.direction='inbound' and last_in.occurred_at > coalesce(c.last_read_at,'-infinity'::timestamptz), false),
        'last_message', coalesce(last_in.body,''), 'last_direction', coalesce(last_in.direction,''),
        'last_status', coalesce(last_in.status,'')) order by c.last_message_at desc)
        from (select c.* from public.whatsapp_contacts c where c.organization_id=p_organization_id
          and (p_connection_id is null or c.connection_id=p_connection_id)
          and (p_section <> 'inbox' or exists(select 1 from public.whatsapp_messages m where m.organization_id=c.organization_id and m.contact_id=c.id))
          and (p_search='' or c.wa_id ilike '%'||p_search||'%' or c.display_name ilike '%'||p_search||'%')
          order by c.last_message_at desc, c.id limit 25 offset ((p_page-1)*25)) c
        left join lateral (select m.direction,m.body,m.status,m.occurred_at from public.whatsapp_messages m
          where m.organization_id=c.organization_id and m.contact_id=c.id
          order by m.occurred_at desc,m.id desc limit 1) last_in on true), '[]'::jsonb),
      'total', (select count(*) from public.whatsapp_contacts c where c.organization_id=p_organization_id
        and (p_connection_id is null or c.connection_id=p_connection_id)
        and (p_section <> 'inbox' or exists(select 1 from public.whatsapp_messages m where m.organization_id=c.organization_id and m.contact_id=c.id))
        and (p_search='' or c.wa_id ilike '%'||p_search||'%' or c.display_name ilike '%'||p_search||'%')),
      'unread', (select count(*) from public.whatsapp_contacts c where c.organization_id=p_organization_id
        and (p_connection_id is null or c.connection_id=p_connection_id)
        and exists(select 1 from public.whatsapp_messages m where m.organization_id=c.organization_id
          and m.contact_id=c.id and m.direction='inbound' and m.occurred_at>coalesce(c.last_read_at,'-infinity'::timestamptz)))
    ) into result;
  end if;
  return coalesce(result, jsonb_build_object('rows','[]'::jsonb,'total',0,'unread',0));
end $$;


create or replace function public.whatsapp_contact_create(
  p_organization_id uuid,
  p_connection_id uuid,
  p_wa_id text,
  p_display_name text,
  p_consent_source text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  normalized_name text := left(trim(coalesce(p_display_name, '')), 120);
  normalized_source text := left(trim(coalesce(p_consent_source, '')), 200);
  result_id uuid;
begin
  perform private.require_permission(p_organization_id, 'automation.manage');
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_wa_id !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Invalid WhatsApp number' using errcode = '22023';
  end if;
  if length(normalized_source) < 3 then
    raise exception 'Consent source is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.whatsapp_business_connections c
    where c.organization_id = p_organization_id
      and c.id = p_connection_id
      and c.status = 'connected'
  ) then
    raise exception 'Connection not found' using errcode = 'P0002';
  end if;

  insert into public.whatsapp_contacts (
    organization_id, connection_id, wa_id, display_name,
    opted_out_at, last_message_at, template_opted_in_at,
    template_opt_in_source, template_opt_in_recorded_by
  )
  values (
    p_organization_id, p_connection_id, p_wa_id, normalized_name,
    null, now(), now(), normalized_source, auth.uid()
  )
  on conflict (organization_id, connection_id, wa_id) do update set
    display_name = case
      when excluded.display_name <> '' then excluded.display_name
      else public.whatsapp_contacts.display_name
    end,
    opted_out_at = null,
    template_opted_in_at = now(),
    template_opt_in_source = excluded.template_opt_in_source,
    template_opt_in_recorded_by = auth.uid(),
    updated_at = now()
  returning id into result_id;

  return result_id;
end $$;

create or replace function public.whatsapp_contact_state(
  p_organization_id uuid,
  p_connection_id uuid,
  p_wa_id text,
  p_action text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    perform private.require_permission(p_organization_id, 'automation.manage');
    if p_action not in ('read', 'opt_out') then
      raise exception 'Invalid contact action' using errcode = '22023';
    end if;
  end if;
  if p_wa_id !~ '^[0-9]{5,32}$' or p_action not in ('read', 'opt_out', 'opt_in') then
    raise exception 'Invalid contact action' using errcode = '22023';
  end if;
  update public.whatsapp_contacts set
    last_read_at = case when p_action = 'read' then now() else last_read_at end,
    opted_out_at = case
      when p_action = 'opt_out' then now()
      when p_action = 'opt_in' then null
      else opted_out_at
    end,
    template_opted_in_at = case
      when p_action = 'opt_in' then now()
      else template_opted_in_at
    end,
    template_opt_in_source = case
      when p_action = 'opt_in' then 'WhatsApp START keyword'
      else template_opt_in_source
    end,
    template_opt_in_recorded_by = case
      when p_action = 'opt_in' then null
      else template_opt_in_recorded_by
    end,
    updated_at = now()
  where organization_id = p_organization_id
    and connection_id = p_connection_id
    and wa_id = p_wa_id;
end $$;

create function public.whatsapp_contact_template_opted_in(
  p_organization_id uuid,
  p_connection_id uuid,
  p_wa_id text
) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission(p_organization_id, 'automation.manage');
  if p_wa_id !~ '^[1-9][0-9]{7,14}$' then return false; end if;
  return exists (
    select 1 from public.whatsapp_contacts c
    where c.organization_id = p_organization_id
      and c.connection_id = p_connection_id
      and c.wa_id = p_wa_id
      and c.opted_out_at is null
      and c.template_opted_in_at is not null
  );
end $$;

revoke all on function public.whatsapp_contact_create(uuid, uuid, text, text, text)
  from public, anon;
revoke all on function public.whatsapp_contact_template_opted_in(uuid, uuid, text)
  from public, anon;
grant execute on function public.whatsapp_contact_create(uuid, uuid, text, text, text)
  to authenticated;
grant execute on function public.whatsapp_contact_template_opted_in(uuid, uuid, text)
  to authenticated;

commit;
