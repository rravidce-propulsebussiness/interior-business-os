-- WhatsApp auto-reply menu ("Reply 1 for Accounts, 2 for Sales …").
-- A 'menu' rule holds an intro message plus up to 10 numbered options. It is
-- sent on a customer's first message (or after 14 days quiet) or when they type
-- "menu" / "0". Choosing an option (typed number or tapped list row) within 24
-- hours sends that option's reply.
begin;

alter table public.whatsapp_automation_rules
  add column if not exists menu jsonb not null default '[]'::jsonb;

do $drop$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.whatsapp_automation_rules'::regclass
      and contype = 'c'
      and conname in ('whatsapp_automation_rules_trigger_type_check','whatsapp_automation_rules_menu_check')
  loop
    execute format('alter table public.whatsapp_automation_rules drop constraint %I', c.conname);
  end loop;
end $drop$;

alter table public.whatsapp_automation_rules
  add constraint whatsapp_automation_rules_trigger_type_check
    check (trigger_type in ('any_message','keyword','greeting','away','menu')),
  add constraint whatsapp_automation_rules_menu_check
    check (jsonb_typeof(menu) = 'array');

alter table public.whatsapp_automation_runs
  add column if not exists kind text not null default 'reply';
do $kind$
begin
  if not exists (select 1 from pg_constraint where conname='whatsapp_automation_runs_kind_check') then
    alter table public.whatsapp_automation_runs
      add constraint whatsapp_automation_runs_kind_check check (kind in ('reply','menu','option'));
  end if;
end $kind$;

-- Options: [{"key":"1","title":"Accounts","reply":"…"}], keys 1–2 digits, unique.
create or replace function private.whatsapp_menu_valid(p_menu jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_menu) = 'array'
    and jsonb_array_length(p_menu) between 1 and 10
    and not exists (
      select 1 from jsonb_array_elements(p_menu) o
      where jsonb_typeof(o) <> 'object'
         or coalesce(o->>'key','') !~ '^[0-9]{1,2}$'
         or length(trim(coalesce(o->>'title',''))) not between 1 and 24
         or length(trim(coalesce(o->>'reply',''))) not between 1 and 1000
    )
    and (select count(distinct o->>'key') from jsonb_array_elements(p_menu) o) = jsonb_array_length(p_menu);
$$;
revoke all on function private.whatsapp_menu_valid(jsonb) from public,anon;

create or replace function public.whatsapp_automation_save(p_organization_id uuid,p_id uuid,p_version integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result_id uuid; next_version integer; kind text; sched jsonb; menu_items jsonb;
begin
  perform private.require_permission(p_organization_id,'automation.manage');
  kind := p_input->>'trigger_type';
  sched := coalesce(p_input->'schedule','{}'::jsonb);
  menu_items := coalesce(p_input->'menu','[]'::jsonb);
  if jsonb_typeof(p_input)<>'object' or length(trim(coalesce(p_input->>'name',''))) not between 1 and 120
     or kind not in ('any_message','keyword','greeting','away','menu')
     or length(trim(coalesce(p_input->>'reply_text',''))) not between 1 and 1000
     or (kind='keyword' and length(trim(coalesce(p_input->>'keyword',''))) not between 1 and 80)
     or (kind='away' and not private.whatsapp_schedule_valid(sched))
     or (kind='menu' and not private.whatsapp_menu_valid(menu_items)) then
     raise exception 'Invalid automation rule' using errcode='22023'; end if;
  if kind <> 'away' then sched := '{}'::jsonb; end if;
  if kind <> 'menu' then menu_items := '[]'::jsonb; end if;
  if p_id is null then
    insert into public.whatsapp_automation_rules(organization_id,connection_id,name,trigger_type,keyword,reply_text,status,schedule,menu,created_by,updated_by)
    values(p_organization_id,(p_input->>'connection_id')::uuid,trim(p_input->>'name'),kind,
      case when kind='keyword' then lower(trim(p_input->>'keyword')) else '' end,
      trim(p_input->>'reply_text'),coalesce(p_input->>'status','paused'),sched,menu_items,auth.uid(),auth.uid())
    returning id,version into result_id,next_version;
  else
    update public.whatsapp_automation_rules set name=trim(p_input->>'name'),trigger_type=kind,
      keyword=case when kind='keyword' then lower(trim(p_input->>'keyword')) else '' end,
      reply_text=trim(p_input->>'reply_text'),status=coalesce(p_input->>'status','paused'),schedule=sched,menu=menu_items,
      version=version+1,updated_by=auth.uid(),updated_at=now()
    where organization_id=p_organization_id and id=p_id and connection_id=(p_input->>'connection_id')::uuid and version=p_version
    returning id,version into result_id,next_version;
    if result_id is null then raise exception 'Rule changed. Reload before saving.' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('id',result_id,'version',next_version);
end $$;

-- Order: away > menu option chosen > menu (first message, 14 days quiet, or
-- "menu"/"0") > greeting > keyword > any message. One reply per inbound message.
create or replace function public.whatsapp_automation_match(p_organization_id uuid,p_connection_id uuid,p_message_id text,p_wa_id text,p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  rule public.whatsapp_automation_rules%rowtype;
  chosen public.whatsapp_automation_rules%rowtype;
  run_id uuid;
  contact_name text;
  contact_uuid uuid;
  body text := trim(coalesce(p_text,''));
  run_kind text := 'reply';
  reply text;
  picked_key text;
  picked_rule uuid;
  first_contact boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_message_id='' or p_wa_id !~ '^[0-9]{5,32}$' or upper(body) in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT') then return null; end if;
  select c.id, c.display_name into contact_uuid, contact_name
  from public.whatsapp_contacts c
  where c.organization_id=p_organization_id and c.connection_id=p_connection_id and c.wa_id=p_wa_id
  limit 1;
  if exists(select 1 from public.whatsapp_contacts c where c.organization_id=p_organization_id and c.connection_id=p_connection_id and c.wa_id=p_wa_id and c.opted_out_at is not null) then return null; end if;

  first_contact := not exists (
    select 1 from public.whatsapp_messages m
    where m.organization_id=p_organization_id and m.connection_id=p_connection_id
      and m.contact_id=contact_uuid and m.direction='inbound'
      and m.provider_message_id<>p_message_id
      and m.occurred_at > now() - interval '14 days'
  );

  -- 1. Away message outside business hours.
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
      chosen := rule; reply := rule.reply_text; exit;
    end if;
  end loop;

  -- 2. A menu option: typed number, or a tapped list row "menu:<rule>:<key>".
  if chosen.id is null then
    if body ~ '^menu:[0-9a-f-]{36}:[0-9]{1,2}$' then
      picked_rule := split_part(body,':',2)::uuid;
      picked_key := split_part(body,':',3);
    elsif body ~ '^[0-9]{1,2}$' then
      picked_key := body;
    end if;
    if picked_key is not null then
      select r.* into rule from public.whatsapp_automation_rules r
      where r.organization_id=p_organization_id and r.connection_id=p_connection_id
        and r.status='active' and r.trigger_type='menu'
        and (picked_rule is null or r.id=picked_rule)
        and exists (
          select 1 from public.whatsapp_automation_runs x
          where x.connection_id=p_connection_id and x.contact_wa_id=p_wa_id and x.rule_id=r.id
            and x.kind='menu' and x.status in ('sending','sent') and x.created_at > now() - interval '24 hours'
        )
      order by r.created_at limit 1;
      if found then
        select o->>'reply' into reply from jsonb_array_elements(rule.menu) o where o->>'key'=picked_key limit 1;
        if reply is not null then chosen := rule; run_kind := 'option'; end if;
      end if;
    end if;
  end if;

  -- 3. Show the menu.
  if chosen.id is null then
    select r.* into rule from public.whatsapp_automation_rules r
    where r.organization_id=p_organization_id and r.connection_id=p_connection_id
      and r.status='active' and r.trigger_type='menu'
    order by r.created_at limit 1;
    if found and (first_contact or lower(body) in ('menu','0')) then
      chosen := rule; reply := rule.reply_text; run_kind := 'menu';
    end if;
  end if;

  -- 4. Greeting.
  if chosen.id is null and first_contact then
    select r.* into chosen from public.whatsapp_automation_rules r
    where r.organization_id=p_organization_id and r.connection_id=p_connection_id
      and r.status='active' and r.trigger_type='greeting'
    order by r.created_at limit 1;
    if chosen.id is not null then reply := chosen.reply_text; end if;
  end if;

  -- 5. Keyword, then any message.
  if chosen.id is null then
    select r.* into chosen from public.whatsapp_automation_rules r
    where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.status='active'
      and (r.trigger_type='any_message' or (r.trigger_type='keyword' and body<>'' and position(r.keyword in lower(body))>0))
    order by case when r.trigger_type='keyword' then 0 else 1 end, r.created_at limit 1;
    if chosen.id is not null then reply := chosen.reply_text; end if;
  end if;
  if chosen.id is null then return null; end if;

  insert into public.whatsapp_automation_runs(organization_id,connection_id,rule_id,inbound_message_id,contact_wa_id,reply_text,kind)
    values(p_organization_id,p_connection_id,chosen.id,p_message_id,p_wa_id,reply,run_kind)
    on conflict(connection_id,inbound_message_id) do update set status='sending',rule_id=excluded.rule_id,reply_text=excluded.reply_text,kind=excluded.kind,error_code='',completed_at=null
      where public.whatsapp_automation_runs.status='failed'
    returning id into run_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'run_id',run_id,'rule_id',chosen.id,'reply_text',reply,'to',p_wa_id,
    'name',coalesce(contact_name,''),'kind',run_kind,
    'menu',case when run_kind='menu' then chosen.menu else '[]'::jsonb end);
end $$;

revoke all on function public.whatsapp_automation_match(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_automation_match(uuid,uuid,text,text,text) to service_role;
revoke all on function public.whatsapp_automation_save(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.whatsapp_automation_save(uuid,uuid,integer,jsonb) to authenticated;

commit;
