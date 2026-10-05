begin;
alter table public.automation_jobs add column manual_retries integer not null default 0 check(manual_retries between 0 and 3);
create function public.automation_read(p_organization_id uuid,p_section text default 'rules',p_page integer default 1,p_id uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$declare rows jsonb;total bigint;begin
 if not private.has_permission(p_organization_id,'automation.view') then raise exception 'Unavailable automation' using errcode='42501';end if;
 if p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;
 case p_section
 when 'rules' then
 select count(*) into total from public.automation_rules where organization_id=p_organization_id and (p_id is null or id=p_id);
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from(select * from public.automation_rules where organization_id=p_organization_id and (p_id is null or id=p_id) order by updated_at desc,id limit 25 offset(p_page-1)*25)r;
 when 'history' then
 return private.automation_history_read(p_organization_id,p_page,p_id);
 when 'events' then
 select count(*) into total from public.automation_events where organization_id=p_organization_id;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from(select id,event_type,entity_kind,entity_id,occurred_at from public.automation_events where organization_id=p_organization_id order by occurred_at desc,id limit 25 offset(p_page-1)*25)r;
 when 'emails' then
 select count(*) into total from public.email_deliveries where organization_id=p_organization_id;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from(select id,event_id,template_key,status,attempts,error_code,created_at,sent_at,provider_message_id from public.email_deliveries where organization_id=p_organization_id order by created_at desc,id limit 25 offset(p_page-1)*25)r;
 when 'templates' then
 select count(*) into total from public.email_templates where organization_id=p_organization_id;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from(select * from public.email_templates where organization_id=p_organization_id order by key limit 25 offset(p_page-1)*25)r;
 else raise exception 'Invalid section' using errcode='22023';end case;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end$$;
create function public.automation_test(p_organization_id uuid,p_rule_id uuid,p_event_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare r public.automation_rules;e public.automation_events;source jsonb;begin
 if not private.has_permission(p_organization_id,'automation.execute') or not private.has_permission(p_organization_id,'automation.view') or not private.automation_event_access(p_organization_id,p_event_id) then raise exception 'Unavailable test' using errcode='42501';end if;
 select * into r from public.automation_rules where organization_id=p_organization_id and id=p_rule_id;
 select * into e from public.automation_events where organization_id=p_organization_id and id=p_event_id;
 if r.id is null or e.id is null then raise exception 'Unavailable test' using errcode='42501';end if;
 source=private.automation_source(p_organization_id,e.entity_kind,e.entity_id);
 return jsonb_build_object('safe_mode',true,'matched',r.event_type=e.event_type and private.automation_matches(r.configuration->'conditions',source||jsonb_build_object('shortage',e.event_type='material.shortage'),e.occurred_at,now()),'event',e.event_type,'source',source,'actions',r.configuration->'actions','rule_version',r.version,'message','Preview only. No notifications, tasks, emails or state changes were made.');
end$$;
create function public.automation_retry(p_organization_id uuid,p_job_id uuid) returns void language plpgsql security definer set search_path='' as $$declare j public.automation_jobs;e public.automation_executions;r public.automation_rules;begin
 perform private.automation_require(p_organization_id,'automation.retry');
 select * into j from public.automation_jobs where organization_id=p_organization_id and id=p_job_id for update;
 select * into e from public.automation_executions where id=j.execution_id;
 select * into r from public.automation_rules where id=e.rule_id;
 if j.id is null or not private.automation_event_access(p_organization_id,e.event_id) then raise exception 'Unavailable job' using errcode='42501';end if;
 if j.status<>'failed' or j.manual_retries>=3 or r.status<>'active' or not exists(select 1 from public.automation_rule_versions where id=e.rule_version_id and version=r.version) then raise exception 'Job cannot be retried' using errcode='40001';end if;
 update public.automation_jobs set status='queued',attempts=0,manual_retries=manual_retries+1,run_at=now(),completed_at=null,lease_token=null,lease_until=null where id=j.id;
 update public.automation_executions set status='queued',completed_at=null where id=e.id;
 perform private.automation_audit(p_organization_id,'automation.job.retried','automation_jobs',j.id);
end$$;
create function public.notifications_read(p_organization_id uuid,p_page integer default 1,p_status text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$declare rows jsonb;total bigint;unread bigint;begin
 if not private.has_permission(p_organization_id,'notification.view') then raise exception 'Unavailable notifications' using errcode='42501';end if;
 if p_page not between 1 and 10000 or (p_status is not null and p_status not in('unread','read','archived')) then raise exception 'Invalid filter' using errcode='22023';end if;
 select count(*),count(*) filter(where status='unread') into total,unread from public.notifications where organization_id=p_organization_id and recipient_id=auth.uid() and (p_status is null and status<>'archived' or status=p_status);
 select coalesce(jsonb_agg(to_jsonb(n)),'[]') into rows from(select id,event_id,category,priority,title,status,version,created_at,read_at from public.notifications where organization_id=p_organization_id and recipient_id=auth.uid() and (p_status is null and status<>'archived' or status=p_status) order by created_at desc,id limit 25 offset(p_page-1)*25)n;
 return jsonb_build_object('rows',rows,'total',total,'unread',unread,'page',p_page);
end$$;
create function public.notification_target(p_organization_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare n public.notifications;e public.automation_events;begin
 select * into n from public.notifications where organization_id=p_organization_id and recipient_id=auth.uid() and id=p_id;
 if n.id is null or not private.has_permission(p_organization_id,'notification.view') or not private.automation_event_access(p_organization_id,n.event_id) then raise exception 'Unavailable notification' using errcode='42501';end if;
 select * into e from public.automation_events where id=n.event_id;
 return private.automation_source(p_organization_id,e.entity_kind,e.entity_id);
end$$;
create function public.notification_state(p_organization_id uuid,p_id uuid,p_version integer,p_status text) returns integer language plpgsql security definer set search_path='' as $$declare n public.notifications;begin
 select * into n from public.notifications where organization_id=p_organization_id and recipient_id=auth.uid() and id=p_id for update;
 if n.id is null or not private.has_permission(p_organization_id,'notification.view') or not private.automation_event_access(p_organization_id,n.event_id) then raise exception 'Unavailable notification' using errcode='42501';end if;
 if p_status not in('read','unread','archived') or p_status is null then raise exception 'Invalid notification state' using errcode='22023';end if;
 if n.status=p_status then return n.version;end if;
 if n.version is distinct from p_version then raise exception 'Notification changed' using errcode='40001';end if;
 update public.notifications set status=p_status,version=version+1,read_at=case when p_status='read' then now() else read_at end where id=n.id returning version into p_version;return p_version;
end$$;
create function public.notification_preferences_save(p_organization_id uuid,p_version integer,p_configuration jsonb) returns integer language plpgsql security definer set search_path='' as $$declare prior public.notification_preferences;category text;begin
 perform private.automation_require(p_organization_id,'notification.manage_preferences');
 if jsonb_typeof(p_configuration) is distinct from 'object' or p_configuration-array['inApp','email','categories','timezone','quietStart','quietEnd']<>'{}'::jsonb or jsonb_typeof(p_configuration->'inApp') is distinct from 'boolean' or jsonb_typeof(p_configuration->'email') is distinct from 'boolean' or jsonb_typeof(p_configuration->'categories') is distinct from 'array' or jsonb_array_length(p_configuration->'categories')>11 or not exists(select 1 from pg_timezone_names where name=p_configuration->>'timezone') then raise exception 'Invalid preferences' using errcode='22023';end if;
 for category in select jsonb_array_elements_text(p_configuration->'categories') loop if category not in('crm','quotation','billing','payment','procurement','inventory','execution','inspection','snag','handover','system') then raise exception 'Invalid category' using errcode='22023';end if;end loop;
 if (p_configuration->>'quietStart' is null)<>(p_configuration->>'quietEnd' is null) or (p_configuration->>'quietStart')::integer not between 0 and 23 or (p_configuration->>'quietEnd')::integer not between 0 and 23 or (p_configuration->>'quietStart')::integer=(p_configuration->>'quietEnd')::integer then raise exception 'Invalid quiet hours' using errcode='22023';end if;
 select * into prior from public.notification_preferences where organization_id=p_organization_id and user_id=auth.uid();
 if coalesce(prior.version,0) is distinct from p_version then raise exception 'Preferences changed' using errcode='40001';end if;
 insert into public.notification_preferences(organization_id,user_id,configuration) values(p_organization_id,auth.uid(),p_configuration) on conflict(organization_id,user_id) do update set configuration=excluded.configuration,version=notification_preferences.version+1,updated_at=now() returning version into p_version;
 perform private.automation_audit(p_organization_id,'notification.preferences.updated','notification_preferences',auth.uid());return p_version;
end$$;
create function public.automation_configure(p_organization_id uuid,p_section text,p_version integer,p_input jsonb) returns integer language plpgsql security definer set search_path='' as $$declare result integer;part text;token text;begin
 perform private.automation_require(p_organization_id,'automation.manage');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>10000 then raise exception 'Invalid configuration' using errcode='22023';end if;
 if p_section='settings' then
 if p_input-array['notification_daily_limit','email_daily_limit','customer_email_enabled','retention_days']<>'{}'::jsonb or not p_input ?& array['notification_daily_limit','email_daily_limit','customer_email_enabled','retention_days'] or jsonb_typeof(p_input->'customer_email_enabled') is distinct from 'boolean' then raise exception 'Invalid settings' using errcode='22023';end if;
 select version into result from public.automation_settings where organization_id=p_organization_id;
 if coalesce(result,0) is distinct from p_version then raise exception 'Settings changed' using errcode='40001';end if;
 insert into public.automation_settings(organization_id,notification_daily_limit,email_daily_limit,customer_email_enabled,retention_days,updated_by) values(p_organization_id,(p_input->>'notification_daily_limit')::integer,(p_input->>'email_daily_limit')::integer,(p_input->>'customer_email_enabled')::boolean,(p_input->>'retention_days')::integer,auth.uid()) on conflict(organization_id) do update set notification_daily_limit=excluded.notification_daily_limit,email_daily_limit=excluded.email_daily_limit,customer_email_enabled=excluded.customer_email_enabled,retention_days=excluded.retention_days,updated_by=auth.uid(),updated_at=now(),version=automation_settings.version+1 returning version into result;
 elsif p_section='template' then
 if p_input-array['key','subject','body']<>'{}'::jsonb or coalesce(p_input->>'key','') !~ '^[a-z][a-z0-9_]{0,59}$' or length(coalesce(p_input->>'subject','')) not between 1 and 180 or length(coalesce(p_input->>'body','')) not between 1 and 5000 then raise exception 'Invalid template' using errcode='22023';end if;
 foreach part in array array[p_input->>'subject',p_input->>'body'] loop
 for token in select m[1] from regexp_matches(part,'\{\{([^{}]+)\}\}','g') m loop if token not in('business_name','entity_number','project_name','due_date','amount_due','currency','action_url') then raise exception 'Unsupported template variable' using errcode='22023';end if;end loop;
 if position('{{' in regexp_replace(part,'\{\{[^{}]+\}\}','','g'))>0 then raise exception 'Malformed template variable' using errcode='22023';end if;end loop;
 select version into result from public.email_templates where organization_id=p_organization_id and key=p_input->>'key';
 if coalesce(result,0) is distinct from p_version then raise exception 'Template changed' using errcode='40001';end if;
 insert into public.email_templates(organization_id,key,subject,body,updated_by) values(p_organization_id,p_input->>'key',p_input->>'subject',p_input->>'body',auth.uid()) on conflict(organization_id,key) do update set subject=excluded.subject,body=excluded.body,version=email_templates.version+1,updated_by=auth.uid(),updated_at=now() returning version into result;
 elsif p_section='consent' then
 if not private.commercial_access(p_organization_id,'customer.manage','customers') or p_input-array['customer_id','email_enabled','evidence']<>'{}'::jsonb or jsonb_typeof(p_input->'email_enabled') is distinct from 'boolean' then raise exception 'Unavailable customer consent' using errcode='42501';end if;
 select version into result from public.communication_consents where organization_id=p_organization_id and customer_id=(p_input->>'customer_id')::uuid;
 if coalesce(result,0) is distinct from p_version then raise exception 'Consent changed' using errcode='40001';end if;
 insert into public.communication_consents(organization_id,customer_id,email_enabled,evidence,updated_by) values(p_organization_id,(p_input->>'customer_id')::uuid,(p_input->>'email_enabled')::boolean,p_input->>'evidence',auth.uid()) on conflict(organization_id,customer_id) do update set email_enabled=excluded.email_enabled,evidence=excluded.evidence,version=communication_consents.version+1,updated_by=auth.uid(),updated_at=now() returning version into result;
 else raise exception 'Invalid configuration section' using errcode='22023';end if;
 perform private.automation_audit(p_organization_id,'automation.'||p_section||'.updated','automation_settings',p_organization_id);return result;
end$$;
create function public.automation_platform_health() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.has_platform_permission('platform.audit.view') then raise exception 'Unavailable worker health' using errcode='42501';end if;
 return jsonb_build_object('workers',(select coalesce(jsonb_agg(jsonb_build_object('worker',worker,'last_seen_at',last_seen_at,'last_result',last_result)),'[]') from private.automation_worker_health),
 'queued_jobs',(select count(*) from public.automation_jobs where status in('queued','retrying')),'failed_jobs',(select count(*) from public.automation_jobs where status='failed'),
 'stuck_jobs',(select count(*) from public.automation_jobs where status='running' and lease_until<now()),'failed_emails',(select count(*) from public.email_deliveries where status in('failed','uncertain')),
 'outbox_backlog',(select count(*) from public.automation_events where dispatched_at is null));
end$$;
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in('automation_read','automation_test','automation_retry','notifications_read','notification_target','notification_state','notification_preferences_save','automation_configure','automation_platform_health') loop
 execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);
end loop;end$$;
commit;

