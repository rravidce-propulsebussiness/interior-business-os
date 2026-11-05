begin;

alter table public.whatsapp_business_connections
  add constraint whatsapp_connections_org_id_unique unique (organization_id, id);

create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  wa_id text not null check (wa_id ~ '^[0-9]{5,32}$'),
  display_name text not null default '',
  opted_out_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, connection_id, wa_id),
  unique (organization_id, id),
  foreign key (organization_id, connection_id)
    references public.whatsapp_business_connections(organization_id, id) on delete cascade
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  contact_id uuid not null,
  provider_message_id text not null,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body text not null default '',
  status text not null default 'received' check (status in ('received','accepted','sent','delivered','read','failed')),
  error_code text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (connection_id, provider_message_id),
  foreign key (organization_id, connection_id)
    references public.whatsapp_business_connections(organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete cascade
);

create table public.whatsapp_automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  trigger_type text not null check (trigger_type in ('any_message','keyword')),
  keyword text not null default '',
  reply_text text not null check (length(trim(reply_text)) between 1 and 1000),
  status text not null default 'paused' check (status in ('active','paused')),
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, connection_id)
    references public.whatsapp_business_connections(organization_id, id) on delete cascade,
  check ((trigger_type = 'any_message' and keyword = '') or
         (trigger_type = 'keyword' and length(trim(keyword)) between 1 and 80))
);

create table public.whatsapp_automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  rule_id uuid not null,
  inbound_message_id text not null,
  contact_wa_id text not null,
  reply_text text not null,
  status text not null default 'sending' check (status in ('sending','sent','failed','skipped')),
  provider_message_id text,
  error_code text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (connection_id, inbound_message_id),
  foreign key (organization_id, connection_id)
    references public.whatsapp_business_connections(organization_id, id) on delete cascade,
  foreign key (organization_id, rule_id)
    references public.whatsapp_automation_rules(organization_id, id) on delete cascade
);

create index whatsapp_contacts_recent on public.whatsapp_contacts(organization_id, connection_id, last_message_at desc, id);
create index whatsapp_messages_thread on public.whatsapp_messages(organization_id, contact_id, occurred_at desc, id);
create index whatsapp_messages_status on public.whatsapp_messages(organization_id, connection_id, status, occurred_at desc);
create index whatsapp_rules_active on public.whatsapp_automation_rules(organization_id, connection_id, status, updated_at desc);

do $$ declare t text; begin
  foreach t in array array['whatsapp_contacts','whatsapp_messages','whatsapp_automation_rules','whatsapp_automation_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create function public.whatsapp_workspace_read(
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
        'opted_out', c.opted_out_at is not null, 'last_message_at', c.last_message_at)
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
        'last_message_at', c.last_message_at, 'last_read_at', c.last_read_at,
        'unread', coalesce(last_in.direction='inbound' and last_in.occurred_at > coalesce(c.last_read_at,'-infinity'::timestamptz), false),
        'last_message', coalesce(last_in.body,''), 'last_direction', coalesce(last_in.direction,''),
        'last_status', coalesce(last_in.status,'')) order by c.last_message_at desc)
        from (select c.* from public.whatsapp_contacts c where c.organization_id=p_organization_id
          and (p_connection_id is null or c.connection_id=p_connection_id)
          and (p_search='' or c.wa_id ilike '%'||p_search||'%' or c.display_name ilike '%'||p_search||'%')
          order by c.last_message_at desc, c.id limit 25 offset ((p_page-1)*25)) c
        left join lateral (select m.direction,m.body,m.status,m.occurred_at from public.whatsapp_messages m
          where m.organization_id=c.organization_id and m.contact_id=c.id
          order by m.occurred_at desc,m.id desc limit 1) last_in on true), '[]'::jsonb),
      'total', (select count(*) from public.whatsapp_contacts c where c.organization_id=p_organization_id
        and (p_connection_id is null or c.connection_id=p_connection_id)
        and (p_search='' or c.wa_id ilike '%'||p_search||'%' or c.display_name ilike '%'||p_search||'%')),
      'unread', (select count(*) from public.whatsapp_contacts c where c.organization_id=p_organization_id
        and (p_connection_id is null or c.connection_id=p_connection_id)
        and exists(select 1 from public.whatsapp_messages m where m.organization_id=c.organization_id
          and m.contact_id=c.id and m.direction='inbound' and m.occurred_at>coalesce(c.last_read_at,'-infinity'::timestamptz)))
    ) into result;
  end if;
  return coalesce(result, jsonb_build_object('rows','[]'::jsonb,'total',0,'unread',0));
end $$;

create function public.whatsapp_message_ingest(
  p_organization_id uuid, p_connection_id uuid, p_change jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare value jsonb; m jsonb; s jsonb; wa text; msg_id text; contact_id uuid; profile_name text; body text; msg_type text; at_time timestamptz; count_added integer:=0;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_business_connections c where c.organization_id=p_organization_id and c.id=p_connection_id and c.status='connected') then raise exception 'Connection not found' using errcode='P0002'; end if;
  value := coalesce(p_change->'value','{}'::jsonb);
  for m in select e.value from jsonb_array_elements(coalesce(value->'messages','[]'::jsonb)) as e(value) loop
    wa:=m->>'from'; msg_id:=m->>'id'; msg_type:=coalesce(m->>'type','unknown');
    if wa !~ '^[0-9]{5,32}$' or coalesce(msg_id,'')='' then continue; end if;
    select coalesce(c.value->'profile'->>'name','') into profile_name from jsonb_array_elements(coalesce(value->'contacts','[]'::jsonb)) as c(value) where c.value->>'wa_id'=wa limit 1;
    body:=coalesce(m->'text'->>'body',m->'button'->>'text',m->'interactive'->'button_reply'->>'title',m->'interactive'->'list_reply'->>'title', '['||msg_type||' message]');
    at_time:=to_timestamp(coalesce(nullif(m->>'timestamp','')::double precision,extract(epoch from now())));
    insert into public.whatsapp_contacts(organization_id,connection_id,wa_id,display_name,last_message_at,updated_at)
    values(p_organization_id,p_connection_id,wa,coalesce(profile_name,''),at_time,now())
    on conflict(organization_id,connection_id,wa_id) do update set
      display_name=case when excluded.display_name<>'' then excluded.display_name else whatsapp_contacts.display_name end,
      last_message_at=greatest(whatsapp_contacts.last_message_at,excluded.last_message_at),updated_at=now()
    returning id into contact_id;
    insert into public.whatsapp_messages(organization_id,connection_id,contact_id,provider_message_id,direction,message_type,body,status,occurred_at)
      values(p_organization_id,p_connection_id,contact_id,msg_id,'inbound',msg_type,left(body,4000),'received',at_time)
      on conflict(connection_id,provider_message_id) do nothing;
    if found then count_added:=count_added+1; end if;
  end loop;
  for s in select e.value from jsonb_array_elements(coalesce(value->'statuses','[]'::jsonb)) as e(value) loop
    update public.whatsapp_messages set status=case when s->>'status' in ('sent','delivered','read','failed') then s->>'status' else status end,
      error_code=coalesce(s->'errors'->0->>'code',''),
      occurred_at=greatest(occurred_at,to_timestamp(coalesce(nullif(s->>'timestamp','')::double precision,extract(epoch from now()))))
    where connection_id=p_connection_id and provider_message_id=s->>'id' and direction='outbound';
  end loop;
  return count_added;
end $$;

create function public.whatsapp_message_log_outbound(
  p_organization_id uuid,p_connection_id uuid,p_to text,p_provider_id text,p_body text,p_type text default 'template'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare contact_id uuid; result uuid; wa text;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  wa:=regexp_replace(p_to,'^[+]','');
  if wa !~ '^[0-9]{8,15}$' or length(p_provider_id)>200 or length(p_body)>4000 then raise exception 'Invalid message' using errcode='22023'; end if;
  insert into public.whatsapp_contacts(organization_id,connection_id,wa_id,last_message_at,updated_at)
    values(p_organization_id,p_connection_id,wa,now(),now())
    on conflict(organization_id,connection_id,wa_id) do update set last_message_at=now(),updated_at=now()
    returning id into contact_id;
  insert into public.whatsapp_messages(organization_id,connection_id,contact_id,provider_message_id,direction,message_type,body,status)
    values(p_organization_id,p_connection_id,contact_id,p_provider_id,'outbound',p_type,left(p_body,4000),'accepted')
    on conflict(connection_id,provider_message_id) do update set body=excluded.body,status='accepted'
    returning id into result;
  return result;
end $$;

create function public.whatsapp_contact_state(p_organization_id uuid,p_connection_id uuid,p_wa_id text,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    perform private.require_permission(p_organization_id,'automation.manage');
    if p_action not in ('read','opt_out') then raise exception 'Invalid contact action' using errcode='22023'; end if;
  end if;
  if p_wa_id !~ '^[0-9]{5,32}$' or p_action not in ('read','opt_out','opt_in') then raise exception 'Invalid contact action' using errcode='22023'; end if;
  update public.whatsapp_contacts set
    last_read_at=case when p_action='read' then now() else last_read_at end,
    opted_out_at=case when p_action='opt_out' then now() when p_action='opt_in' then null else opted_out_at end,
    updated_at=now()
  where organization_id=p_organization_id and connection_id=p_connection_id and wa_id=p_wa_id;
end $$;

create function public.whatsapp_window_open(p_organization_id uuid,p_connection_id uuid,p_wa_id text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission(p_organization_id,'automation.view');
  return exists(select 1 from public.whatsapp_contacts c join public.whatsapp_messages m
    on m.organization_id=c.organization_id and m.contact_id=c.id
    where c.organization_id=p_organization_id and c.connection_id=p_connection_id and c.wa_id=p_wa_id
      and c.opted_out_at is null and m.direction='inbound' and m.occurred_at>now()-interval '24 hours');
end $$;

create function public.whatsapp_contact_opted_out(p_organization_id uuid,p_connection_id uuid,p_wa_id text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission(p_organization_id,'automation.manage');
  return exists(select 1 from public.whatsapp_contacts c where c.organization_id=p_organization_id
    and c.connection_id=p_connection_id and c.wa_id=p_wa_id and c.opted_out_at is not null);
end $$;

create function public.whatsapp_automation_save(p_organization_id uuid,p_id uuid,p_version integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result_id uuid; next_version integer;
begin
  perform private.require_permission(p_organization_id,'automation.manage');
  if jsonb_typeof(p_input)<>'object' or length(trim(coalesce(p_input->>'name',''))) not between 1 and 120
     or p_input->>'trigger_type' not in ('any_message','keyword')
     or length(trim(coalesce(p_input->>'reply_text',''))) not between 1 and 1000
     or (p_input->>'trigger_type'='keyword' and length(trim(coalesce(p_input->>'keyword',''))) not between 1 and 80) then
     raise exception 'Invalid automation rule' using errcode='22023'; end if;
  if p_id is null then
    insert into public.whatsapp_automation_rules(organization_id,connection_id,name,trigger_type,keyword,reply_text,status,created_by,updated_by)
    values(p_organization_id,(p_input->>'connection_id')::uuid,trim(p_input->>'name'),p_input->>'trigger_type',lower(trim(coalesce(p_input->>'keyword',''))),trim(p_input->>'reply_text'),coalesce(p_input->>'status','paused'),auth.uid(),auth.uid()) returning id,version into result_id,next_version;
  else
    update public.whatsapp_automation_rules set name=trim(p_input->>'name'),trigger_type=p_input->>'trigger_type',keyword=lower(trim(coalesce(p_input->>'keyword',''))),reply_text=trim(p_input->>'reply_text'),status=coalesce(p_input->>'status','paused'),version=version+1,updated_by=auth.uid(),updated_at=now()
    where organization_id=p_organization_id and id=p_id and connection_id=(p_input->>'connection_id')::uuid and version=p_version
    returning id,version into result_id,next_version;
    if result_id is null then raise exception 'Rule changed. Reload before saving.' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('id',result_id,'version',next_version);
end $$;

create function public.whatsapp_automation_match(p_organization_id uuid,p_connection_id uuid,p_message_id text,p_wa_id text,p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rule public.whatsapp_automation_rules%rowtype; run_id uuid; contact_name text;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_message_id='' or p_wa_id !~ '^[0-9]{5,32}$' or upper(trim(p_text)) in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT') then return null; end if;
  if exists(select 1 from public.whatsapp_contacts c where c.organization_id=p_organization_id and c.connection_id=p_connection_id and c.wa_id=p_wa_id and c.opted_out_at is not null) then return null; end if;
  select r.* into rule from public.whatsapp_automation_rules r where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.status='active'
    and (r.trigger_type='any_message' or position(r.keyword in lower(p_text))>0) order by case when r.trigger_type='keyword' then 0 else 1 end,r.created_at limit 1;
  if not found then return null; end if;
  select c.display_name into contact_name from public.whatsapp_contacts c where c.organization_id=p_organization_id and c.connection_id=p_connection_id and c.wa_id=p_wa_id limit 1;
  insert into public.whatsapp_automation_runs(organization_id,connection_id,rule_id,inbound_message_id,contact_wa_id,reply_text)
    values(p_organization_id,p_connection_id,rule.id,p_message_id,p_wa_id,rule.reply_text)
    on conflict(connection_id,inbound_message_id) do update set status='sending',rule_id=excluded.rule_id,reply_text=excluded.reply_text,error_code='',completed_at=null
      where public.whatsapp_automation_runs.status='failed'
    returning id into run_id;
  if not found then return null; end if;
  return jsonb_build_object('run_id',run_id,'rule_id',rule.id,'reply_text',rule.reply_text,'to',p_wa_id,'name',coalesce(contact_name,''));
end $$;

create function public.whatsapp_automation_finish(p_organization_id uuid,p_run_id uuid,p_status text,p_provider_id text default null,p_error text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_status not in ('sent','failed','skipped') then raise exception 'Invalid status' using errcode='22023'; end if;
  update public.whatsapp_automation_runs set status=p_status,provider_message_id=p_provider_id,error_code=left(p_error,120),completed_at=now()
    where organization_id=p_organization_id and id=p_run_id;
end $$;

revoke all on function public.whatsapp_workspace_read(uuid,text,uuid,text,text,integer) from public,anon;
revoke all on function public.whatsapp_message_ingest(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.whatsapp_message_log_outbound(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.whatsapp_contact_state(uuid,uuid,text,text) from public,anon;
revoke all on function public.whatsapp_window_open(uuid,uuid,text) from public,anon;
revoke all on function public.whatsapp_contact_opted_out(uuid,uuid,text) from public,anon;
revoke all on function public.whatsapp_automation_save(uuid,uuid,integer,jsonb) from public,anon;
revoke all on function public.whatsapp_automation_match(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.whatsapp_automation_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_workspace_read(uuid,text,uuid,text,text,integer) to authenticated;
grant execute on function public.whatsapp_contact_state(uuid,uuid,text,text) to authenticated;
grant execute on function public.whatsapp_contact_state(uuid,uuid,text,text) to service_role;
grant execute on function public.whatsapp_window_open(uuid,uuid,text) to authenticated;
grant execute on function public.whatsapp_contact_opted_out(uuid,uuid,text) to authenticated;
grant execute on function public.whatsapp_automation_save(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.whatsapp_message_ingest(uuid,uuid,jsonb) to service_role;
grant execute on function public.whatsapp_message_log_outbound(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.whatsapp_automation_match(uuid,uuid,text,text,text) to service_role;
grant execute on function public.whatsapp_automation_finish(uuid,uuid,text,text,text) to service_role;

commit;
