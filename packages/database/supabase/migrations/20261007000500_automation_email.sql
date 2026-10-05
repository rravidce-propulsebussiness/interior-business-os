begin;
alter table public.automation_settings add column recipient_cooldown_minutes integer not null default 60 check(recipient_cooldown_minutes between 1 and 1440);
create table private.automation_email_payloads(delivery_id uuid primary key references public.email_deliveries(id),recipient text not null,subject text not null,body text not null,source_amount text,first_attempt_at timestamptz not null default now());
create function private.automation_email_claim(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;j public.automation_jobs;x public.automation_executions;r public.automation_rules;e public.automation_events;t public.email_templates;s jsonb;pref jsonb;payload private.automation_email_payloads;recipient text;subject text;body text;vars jsonb;k text;value text;token uuid;zone text;daily integer;cooldown integer;last_sent timestamptz;category text;hour integer;defer_at timestamptz;result jsonb='[]';old_sub text=current_setting('request.jwt.claim.sub',true);valid boolean;begin
 if p_limit not between 1 and 25 then raise exception 'Invalid email batch';end if;
 for d in select * from public.email_deliveries where (status in('queued','retrying') or status='sending' and lease_until<now()) and next_attempt_at<=now() and attempts<3 order by next_attempt_at,id for update skip locked limit p_limit loop
 perform 1 from public.organizations where id=d.organization_id for update;
 select * into j from public.automation_jobs where id=d.job_id;
 select * into x from public.automation_executions where id=j.execution_id;
 select * into r from public.automation_rules where id=x.rule_id;
 select * into e from public.automation_events where id=d.event_id;
 perform set_config('request.jwt.claim.sub',r.run_as::text,true);
 valid=r.status='active' and private.has_permission(d.organization_id,'automation.manage') and private.has_permission(d.organization_id,'automation.execute') and private.automation_event_access(d.organization_id,e.id) and exists(select 1 from public.automation_rule_versions where id=x.rule_version_id and version=r.version);
 s=private.automation_source(d.organization_id,e.entity_kind,e.entity_id);
 if s is null or not valid then update public.email_deliveries set status='skipped',error_code='source_access_or_rule_changed' where id=d.id;continue;end if;
 if not private.automation_scheduled_match(d.organization_id,e.event_type,s,now()) then update public.email_deliveries set status='skipped',error_code='source_no_longer_actionable' where id=d.id;continue;end if;
 recipient=null;
 if d.customer_id is not null then
 if not exists(select 1 from public.automation_settings where organization_id=d.organization_id and customer_email_enabled) or not exists(select 1 from public.communication_consents where organization_id=d.organization_id and customer_id=d.customer_id and email_enabled) then update public.email_deliveries set status='skipped',error_code='customer_consent_revoked' where id=d.id;continue;end if;
 select email into recipient from public.customers where organization_id=d.organization_id and id=d.customer_id and status='active';
 else
 select ent.category into category from private.automation_entities ent where kind=e.entity_kind;
 if e.event_type='material.shortage' then category='inventory';end if;
 select configuration into pref from public.notification_preferences where organization_id=d.organization_id and user_id=d.recipient_id;
 if not private.automation_recipient_access(d.organization_id,d.recipient_id,d.event_id) or not coalesce((pref->>'email')::boolean,false) or (pref ? 'categories' and not pref->'categories' ? category) then update public.email_deliveries set status='skipped',error_code='recipient_access_or_preferences_changed' where id=d.id;continue;end if;
 zone=coalesce(pref->>'timezone',(select default_timezone from public.organizations where id=d.organization_id));hour=extract(hour from now() at time zone zone);
 if pref->>'quietStart' is not null and pref->>'quietEnd' is not null and (case when (pref->>'quietStart')::integer<(pref->>'quietEnd')::integer then hour>=(pref->>'quietStart')::integer and hour<(pref->>'quietEnd')::integer else hour>=(pref->>'quietStart')::integer or hour<(pref->>'quietEnd')::integer end) then
 defer_at=(((now() at time zone zone)::date+case when hour>=(pref->>'quietEnd')::integer then 1 else 0 end)+make_interval(hours=>(pref->>'quietEnd')::integer)) at time zone zone;
 update public.email_deliveries set next_attempt_at=defer_at,error_code='quiet_hours' where id=d.id;continue;end if;
 select u.email into recipient from auth.users u join public.profiles p on p.id=u.id where p.id=d.recipient_id and p.status='active';
 end if;
 if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(recipient)>254 then update public.email_deliveries set status='failed',error_code='recipient_contact_missing' where id=d.id;continue;end if;
 select default_timezone into zone from public.organizations where id=d.organization_id;
 select email_daily_limit,recipient_cooldown_minutes into daily,cooldown from public.automation_settings where organization_id=d.organization_id;
 if (select count(*) from public.email_deliveries where organization_id=d.organization_id and id<>d.id and status in('sending','sent') and (coalesce(sent_at,created_at) at time zone zone)::date=(now() at time zone zone)::date)>=coalesce(daily,100) then update public.email_deliveries set next_attempt_at=now()+interval '1 hour',error_code='email_daily_limit' where id=d.id;continue;end if;
 select max(coalesce(sent_at,created_at)) into last_sent from public.email_deliveries where organization_id=d.organization_id and id<>d.id and recipient_id is not distinct from d.recipient_id and customer_id is not distinct from d.customer_id and status in('sending','sent');
 if last_sent>now()-make_interval(mins=>coalesce(cooldown,60)) then update public.email_deliveries set next_attempt_at=last_sent+make_interval(mins=>coalesce(cooldown,60)),error_code='recipient_cooldown' where id=d.id;continue;end if;
 select * into payload from private.automation_email_payloads where delivery_id=d.id;
 if payload.delivery_id is not null then
 if payload.first_attempt_at<now()-interval '23 hours' then update public.email_deliveries set status='uncertain',error_code='provider_idempotency_window_expired' where id=d.id;continue;end if;
 if payload.recipient<>recipient or payload.source_amount is distinct from s->>'amount' then update public.email_deliveries set status='uncertain',error_code='source_changed_after_delivery_attempt' where id=d.id;continue;end if;
 else
 select * into t from public.email_templates where organization_id=d.organization_id and key=d.template_key;
 if t.id is null then update public.email_deliveries set status='failed',error_code='template_missing' where id=d.id;continue;end if;
 vars=jsonb_build_object('business_name',(select name from public.organizations where id=d.organization_id),'entity_number',s->>'number','project_name',coalesce(s->>'project_name',''),'due_date',coalesce(((s->>'due_at')::timestamptz at time zone zone)::date::text,''),'amount_due',coalesce(s->>'amount',''),'currency',coalesce(s->>'currency',''),'action_url','');
 subject=t.subject;body=t.body;
 for k,value in select * from jsonb_each_text(vars) loop subject=replace(subject,'{{'||k||'}}',value);body=replace(body,'{{'||k||'}}',value);end loop;
 subject=translate(subject,E'\r\n','  ');
 insert into private.automation_email_payloads(delivery_id,recipient,subject,body,source_amount) values(d.id,recipient,subject,body,s->>'amount') returning * into payload;
 end if;
 token=gen_random_uuid();
 update public.email_deliveries set status='sending',attempts=attempts+1,lease_token=token,lease_until=now()+interval '2 minutes',error_code='' where id=d.id;
 result=result||jsonb_build_array(jsonb_build_object('id',d.id,'lease',token,'recipient',payload.recipient,'subject',payload.subject,'text',payload.body,'idempotencyKey','business-os-email/'||d.id));
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);return result;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);raise;
end$$;
create function private.automation_email_ack(p_id uuid,p_lease uuid,p_result text,p_provider_id text default null) returns boolean language plpgsql security definer set search_path='' as $$declare d public.email_deliveries;begin
 if p_result not in('sent','transient','permanent','unconfigured','uncertain') or length(coalesce(p_provider_id,''))>200 then raise exception 'Invalid delivery result' using errcode='22023';end if;
 select * into d from public.email_deliveries where id=p_id for update;
 if d.status is distinct from 'sending' or d.lease_token is distinct from p_lease then return false;end if;
 update public.email_deliveries set status=case when p_result='sent' then 'sent' when p_result='uncertain' then 'uncertain' when p_result='transient' and attempts<3 then 'retrying' else 'failed' end,
 sent_at=case when p_result='sent' then now() end,provider_message_id=case when p_result='sent' then p_provider_id end,
 error_code=case when p_result='sent' then '' when p_result='unconfigured' then 'provider_not_configured' else 'provider_'||p_result end,next_attempt_at=now()+interval '5 minutes'*attempts,lease_token=null,lease_until=null where id=d.id;
 return true;
end$$;
create function private.automation_retention() returns integer language plpgsql security definer set search_path='' as $$declare affected integer;begin
 -- Only transient email bodies expire. Domain, event, rule and export history is retained.
 update public.email_deliveries d set status='uncertain',error_code='provider_idempotency_window_expired',lease_token=null,lease_until=null from private.automation_email_payloads p where p.delivery_id=d.id and p.first_attempt_at<now()-interval '23 hours' and d.status in('sending','retrying');
 delete from private.automation_email_payloads p using public.email_deliveries d where p.delivery_id=d.id and p.first_attempt_at<now()-interval '1 day' and d.status in('sent','failed','skipped','uncertain');get diagnostics affected=row_count;
 update public.notifications n set status='archived',version=n.version+1 from public.automation_settings s where s.organization_id=n.organization_id and n.status='read' and n.created_at<now()-make_interval(days=>s.retention_days);
 return affected;
end$$;
revoke all on private.automation_email_payloads from public,anon,authenticated,business_os_worker;
revoke all on function private.automation_email_claim(integer),private.automation_email_ack(uuid,uuid,text,text),private.automation_retention() from public,anon,authenticated,business_os_worker;
grant execute on function private.automation_email_claim(integer),private.automation_email_ack(uuid,uuid,text,text),private.automation_retention() to business_os_worker;
commit;


