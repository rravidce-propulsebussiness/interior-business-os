-- WhatsApp Business-style automation: greeting and away messages with business
-- hours, plus organization-wide quick replies.
begin;

-- 1. New trigger types and a business-hours schedule on reply rules.
do $drop$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.whatsapp_automation_rules'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%trigger_type%'
  loop
    execute format('alter table public.whatsapp_automation_rules drop constraint %I', c.conname);
  end loop;
end $drop$;

alter table public.whatsapp_automation_rules
  add column if not exists schedule jsonb not null default '{}'::jsonb;

alter table public.whatsapp_automation_rules
  add constraint whatsapp_automation_rules_trigger_type_check
    check (trigger_type in ('any_message','keyword','greeting','away')),
  add constraint whatsapp_automation_rules_keyword_check
    check ((trigger_type = 'keyword' and length(trim(keyword)) between 1 and 80)
        or (trigger_type <> 'keyword' and keyword = '')),
  add constraint whatsapp_automation_rules_schedule_check
    check (jsonb_typeof(schedule) = 'object');

create index if not exists whatsapp_runs_contact_recent
  on public.whatsapp_automation_runs(connection_id, contact_wa_id, rule_id, created_at desc);

-- Schedule shape: {"timezone":"Asia/Kolkata","days":[1,2,3,4,5,6],"start":"09:00","end":"19:00"}
-- days use 0 = Sunday … 6 = Saturday. An end before start means overnight hours.
create or replace function private.whatsapp_schedule_valid(p_schedule jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_schedule) = 'object'
    and coalesce(p_schedule->>'start','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and coalesce(p_schedule->>'end','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and jsonb_typeof(p_schedule->'days') = 'array'
    and jsonb_array_length(p_schedule->'days') between 1 and 7
    and not exists (
      select 1 from jsonb_array_elements(p_schedule->'days') d
      where jsonb_typeof(d) <> 'number' or (d::text)::int not between 0 and 6
    );
$$;

create or replace function private.whatsapp_within_hours(p_schedule jsonb, p_at timestamptz)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  tz text := coalesce(nullif(p_schedule->>'timezone',''), 'Asia/Kolkata');
  local_ts timestamp;
  hm text;
  starts text := p_schedule->>'start';
  ends text := p_schedule->>'end';
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    tz := 'Asia/Kolkata';
  end if;
  local_ts := p_at at time zone tz;
  hm := to_char(local_ts, 'HH24:MI');
  if not (p_schedule->'days') @> to_jsonb(extract(dow from local_ts)::int) then
    return false;
  end if;
  if starts <= ends then
    return hm >= starts and hm < ends;
  end if;
  return hm >= starts or hm < ends;  -- overnight, e.g. 20:00-02:00
end $$;

create or replace function public.whatsapp_automation_save(p_organization_id uuid,p_id uuid,p_version integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result_id uuid; next_version integer; kind text; sched jsonb;
begin
  perform private.require_permission(p_organization_id,'automation.manage');
  kind := p_input->>'trigger_type';
  sched := coalesce(p_input->'schedule','{}'::jsonb);
  if jsonb_typeof(p_input)<>'object' or length(trim(coalesce(p_input->>'name',''))) not between 1 and 120
     or kind not in ('any_message','keyword','greeting','away')
     or length(trim(coalesce(p_input->>'reply_text',''))) not between 1 and 1000
     or (kind='keyword' and length(trim(coalesce(p_input->>'keyword',''))) not between 1 and 80)
     or (kind='away' and not private.whatsapp_schedule_valid(sched)) then
     raise exception 'Invalid automation rule' using errcode='22023'; end if;
  if kind <> 'away' then sched := '{}'::jsonb; end if;
  if p_id is null then
    insert into public.whatsapp_automation_rules(organization_id,connection_id,name,trigger_type,keyword,reply_text,status,schedule,created_by,updated_by)
    values(p_organization_id,(p_input->>'connection_id')::uuid,trim(p_input->>'name'),kind,
      case when kind='keyword' then lower(trim(p_input->>'keyword')) else '' end,
      trim(p_input->>'reply_text'),coalesce(p_input->>'status','paused'),sched,auth.uid(),auth.uid())
    returning id,version into result_id,next_version;
  else
    update public.whatsapp_automation_rules set name=trim(p_input->>'name'),trigger_type=kind,
      keyword=case when kind='keyword' then lower(trim(p_input->>'keyword')) else '' end,
      reply_text=trim(p_input->>'reply_text'),status=coalesce(p_input->>'status','paused'),schedule=sched,
      version=version+1,updated_by=auth.uid(),updated_at=now()
    where organization_id=p_organization_id and id=p_id and connection_id=(p_input->>'connection_id')::uuid and version=p_version
    returning id,version into result_id,next_version;
    if result_id is null then raise exception 'Rule changed. Reload before saving.' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('id',result_id,'version',next_version);
end $$;

-- One automatic reply per inbound message, chosen in WhatsApp Business order:
-- away (outside hours, once per 12 h per contact) > greeting (first message or
-- after 14 days quiet) > keyword > any message.
create or replace function public.whatsapp_automation_match(p_organization_id uuid,p_connection_id uuid,p_message_id text,p_wa_id text,p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  rule public.whatsapp_automation_rules%rowtype;
  chosen public.whatsapp_automation_rules%rowtype;
  run_id uuid;
  contact_name text;
  contact_uuid uuid;
  body text := coalesce(p_text,'');
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_message_id='' or p_wa_id !~ '^[0-9]{5,32}$' or upper(trim(body)) in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT') then return null; end if;
  select c.id, c.display_name into contact_uuid, contact_name
  from public.whatsapp_contacts c
  where c.organization_id=p_organization_id and c.connection_id=p_connection_id and c.wa_id=p_wa_id
  limit 1;
  if exists(select 1 from public.whatsapp_contacts c where c.organization_id=p_organization_id and c.connection_id=p_connection_id and c.wa_id=p_wa_id and c.opted_out_at is not null) then return null; end if;

  for rule in
    select r.* from public.whatsapp_automation_rules r
    where r.organization_id=p_organization_id and r.connection_id=p_connection_id
      and r.status='active' and r.trigger_type='away'
    order by r.created_at
  loop
    if not private.whatsapp_within_hours(rule.schedule, now())
       and not exists (
         select 1 from public.whatsapp_automation_runs x
         where x.connection_id=p_connection_id and x.contact_wa_id=p_wa_id and x.rule_id=rule.id
           and x.status in ('sending','sent') and x.created_at > now() - interval '12 hours'
       ) then
      chosen := rule; exit;
    end if;
  end loop;

  if chosen.id is null then
    select r.* into rule from public.whatsapp_automation_rules r
    where r.organization_id=p_organization_id and r.connection_id=p_connection_id
      and r.status='active' and r.trigger_type='greeting'
    order by r.created_at limit 1;
    if found and not exists (
      select 1 from public.whatsapp_messages m
      where m.organization_id=p_organization_id and m.connection_id=p_connection_id
        and m.contact_id=contact_uuid and m.direction='inbound'
        and m.provider_message_id<>p_message_id
        and m.occurred_at > now() - interval '14 days'
    ) then
      chosen := rule;
    end if;
  end if;

  if chosen.id is null then
    select r.* into chosen from public.whatsapp_automation_rules r
    where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.status='active'
      and (r.trigger_type='any_message' or (r.trigger_type='keyword' and body<>'' and position(r.keyword in lower(body))>0))
    order by case when r.trigger_type='keyword' then 0 else 1 end, r.created_at limit 1;
  end if;
  if chosen.id is null then return null; end if;

  insert into public.whatsapp_automation_runs(organization_id,connection_id,rule_id,inbound_message_id,contact_wa_id,reply_text)
    values(p_organization_id,p_connection_id,chosen.id,p_message_id,p_wa_id,chosen.reply_text)
    on conflict(connection_id,inbound_message_id) do update set status='sending',rule_id=excluded.rule_id,reply_text=excluded.reply_text,error_code='',completed_at=null
      where public.whatsapp_automation_runs.status='failed'
    returning id into run_id;
  if not found then return null; end if;
  return jsonb_build_object('run_id',run_id,'rule_id',chosen.id,'reply_text',chosen.reply_text,'to',p_wa_id,'name',coalesce(contact_name,''));
end $$;

revoke all on function public.whatsapp_automation_match(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_automation_match(uuid,uuid,text,text,text) to service_role;
revoke all on function public.whatsapp_automation_save(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.whatsapp_automation_save(uuid,uuid,integer,jsonb) to authenticated;
revoke all on function private.whatsapp_schedule_valid(jsonb) from public,anon;
revoke all on function private.whatsapp_within_hours(jsonb,timestamptz) from public,anon;

-- 2. Quick replies: saved answers staff insert with "/shortcut".
create table if not exists public.whatsapp_quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shortcut text not null check (shortcut ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shortcut)
);
alter table public.whatsapp_quick_replies enable row level security;
alter table public.whatsapp_quick_replies force row level security;
revoke all on public.whatsapp_quick_replies from public, anon, authenticated;
grant all on public.whatsapp_quick_replies to service_role;

commit;
