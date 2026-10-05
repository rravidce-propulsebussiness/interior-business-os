begin;
create function private.automation_dispatch(p_limit integer default 100) returns integer language plpgsql security definer set search_path='' as $$
declare e public.automation_events;r public.automation_rules;v public.automation_rule_versions;source jsonb;execution uuid;a jsonb;idx integer;run_at timestamptz;zone text;reason text;old_sub text=current_setting('request.jwt.claim.sub',true);count_events integer=0;begin
 if p_limit not between 1 and 500 then raise exception 'Invalid dispatch bound';end if;
 for e in select * from public.automation_events where dispatched_at is null order by occurred_at,id for update skip locked limit p_limit loop
 for r in select * from public.automation_rules where organization_id=e.organization_id and event_type=e.event_type and status='active' and created_at<=e.occurred_at order by id loop
 perform set_config('request.jwt.claim.sub',r.run_as::text,true);
 source=private.automation_source(e.organization_id,e.entity_kind,e.entity_id);reason='';
 select * into v from public.automation_rule_versions where rule_id=r.id and version=r.version;
 if not private.has_permission(e.organization_id,'automation.manage') or not private.has_permission(e.organization_id,'automation.execute') or source is null or not private.automation_event_access(e.organization_id,e.id) then reason='source_access_revoked';
 elsif e.chain_depth>=5 then reason='chain_depth_limit';
 elsif not private.automation_matches(r.configuration->'conditions',source||jsonb_build_object('shortage',e.event_type='material.shortage'),case when e.event_type='lead.inactive' then (source->>'updated_at')::timestamptz else e.occurred_at end,now()) then reason='conditions_not_matched';
 end if;
 select default_timezone into zone from public.organizations where id=e.organization_id;
 perform 1 from public.organizations where id=e.organization_id for update;
 if reason='' and (select count(*) from public.automation_executions x where x.rule_id=r.id and x.status not in('skipped','cancelled') and (x.created_at at time zone zone)::date=(now() at time zone zone)::date)>=(r.configuration->>'dailyLimit')::integer then reason='daily_rule_limit';end if;
 if reason='' and (select count(*) from public.automation_executions x join public.automation_events old on old.id=x.event_id where x.rule_id=r.id and old.entity_kind=e.entity_kind and old.entity_id=e.entity_id and x.status not in('skipped','cancelled'))>=(r.configuration->>'maxPerEntity')::integer then reason='entity_repeat_limit';end if;
 if reason='' and exists(select 1 from public.automation_executions x join public.automation_events old on old.id=x.event_id where x.rule_id=r.id and old.entity_kind=e.entity_kind and old.entity_id=e.entity_id and x.status not in('skipped','cancelled') and x.created_at>now()-make_interval(mins=>(r.configuration->>'cooldownMinutes')::integer)) then reason='cooldown';end if;
 execution=null;
 insert into public.automation_executions(organization_id,rule_id,rule_version_id,event_id,status,reason,completed_at) values(e.organization_id,r.id,v.id,e.id,case when reason='' then 'queued' else 'skipped' end,reason,case when reason<>'' then now() end) on conflict(rule_id,event_id) do nothing returning id into execution;
 if execution is not null and reason='' then
 idx=0;
 for a in select value from jsonb_array_elements(v.configuration->'actions') loop
 run_at=case a->>'dueBasis' when 'due_before' then (source->>'due_at')::timestamptz-make_interval(mins=>(a->>'delayMinutes')::integer) when 'due_after' then (source->>'due_at')::timestamptz+make_interval(mins=>(a->>'delayMinutes')::integer) else e.occurred_at+make_interval(mins=>(a->>'delayMinutes')::integer) end;
 if run_at is not null and r.mode='scheduled' then run_at=((run_at at time zone zone)::date+make_interval(hours=>(v.configuration->>'scheduleHour')::integer)) at time zone zone;end if;
 insert into public.automation_jobs(organization_id,execution_id,action_index,action,run_at,status,error_code) values(e.organization_id,execution,idx,a,coalesce(run_at,now()),case when run_at is null then 'failed' else 'queued' end,case when run_at is null then 'source_has_no_due_date' else '' end);
 idx=idx+1;end loop;
 update public.automation_executions set status='failed',completed_at=now(),reason='source_has_no_due_date' where id=execution and not exists(select 1 from public.automation_jobs where execution_id=execution and status<>'failed');
 end if;
 end loop;
 update public.automation_events set dispatched_at=now() where id=e.id;count_events=count_events+1;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);return count_events;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);raise;
end$$;
create function private.automation_recipient_access(org uuid,person uuid,event uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare old_sub text=current_setting('request.jwt.claim.sub',true);allowed boolean;begin
 if person is null then return false;end if;
 perform set_config('request.jwt.claim.sub',person::text,true);
 allowed=private.has_permission(org,'notification.view') and private.automation_event_access(org,event);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);return coalesce(allowed,false);
exception when others then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);raise;end$$;
create function private.automation_execute_job(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs;x public.automation_executions;r public.automation_rules;v public.automation_rule_versions;e public.automation_events;source jsonb;recipient uuid;preferences jsonb;category text;result uuid;plan uuid;zone text;hour integer;defer_at timestamptz;quota integer;customer uuid;begin
 select * into j from public.automation_jobs where id=target;
 select * into x from public.automation_executions where id=j.execution_id;
 select * into r from public.automation_rules where id=x.rule_id;
 select * into v from public.automation_rule_versions where id=x.rule_version_id;
 select * into e from public.automation_events where id=x.event_id;
 if r.status<>'active' or r.version<>v.version then update public.automation_jobs set status='cancelled',completed_at=now(),error_code='rule_disabled_or_changed' where id=j.id;return;end if;
 perform set_config('request.jwt.claim.sub',r.run_as::text,true);
 if not private.has_permission(j.organization_id,'automation.manage') or not private.has_permission(j.organization_id,'automation.execute') or not private.automation_event_access(j.organization_id,e.id) then raise exception 'source_access_revoked' using errcode='42501';end if;
 source=private.automation_source(j.organization_id,e.entity_kind,e.entity_id);
 if not private.automation_scheduled_match(j.organization_id,e.event_type,source,now()) then update public.automation_jobs set status='skipped',completed_at=now(),error_code='source_no_longer_actionable' where id=j.id;return;end if;
 if not private.automation_matches(v.configuration->'conditions',source||jsonb_build_object('shortage',e.event_type='material.shortage'),case when e.event_type='lead.inactive' then (source->>'updated_at')::timestamptz else e.occurred_at end,now()) then update public.automation_jobs set status='skipped',completed_at=now(),error_code='conditions_no_longer_matched' where id=j.id;return;end if;
 recipient=case j.action->>'recipient' when 'actor' then e.actor_id when 'user' then (j.action->>'userId')::uuid when 'manager' then (source->>'manager_id')::uuid else (source->>'assignee_id')::uuid end;
 select default_timezone into zone from public.organizations where id=j.organization_id;
 select ent.category into category from private.automation_entities ent where kind=e.entity_kind;
 if e.event_type='material.shortage' then category='inventory';end if;
 if j.action->>'audience'='internal' and j.action->>'kind' in('notify','reminder','escalation','email','followup','task','assign_task') and not private.automation_recipient_access(j.organization_id,recipient,e.id) then raise exception 'recipient_access_unavailable' using errcode='42501';end if;
 select configuration into preferences from public.notification_preferences where organization_id=j.organization_id and user_id=recipient;
 if j.action->>'kind' in('notify','reminder','escalation','email') and j.action->>'audience'='internal' then
 if (preferences ? 'categories' and not preferences->'categories' ? category) or (j.action->>'kind'<>'email' and coalesce((preferences->>'inApp')::boolean,true)=false) or (j.action->>'kind'='email' and not coalesce((preferences->>'email')::boolean,false)) then update public.automation_jobs set status='skipped',completed_at=now(),error_code='recipient_preferences' where id=j.id;return;end if;
 zone=coalesce(preferences->>'timezone',zone);hour=extract(hour from now() at time zone zone);
 if preferences->>'quietStart' is not null and preferences->>'quietEnd' is not null and (case when (preferences->>'quietStart')::integer<(preferences->>'quietEnd')::integer then hour>=(preferences->>'quietStart')::integer and hour<(preferences->>'quietEnd')::integer else hour>=(preferences->>'quietStart')::integer or hour<(preferences->>'quietEnd')::integer end) then
 defer_at=(((now() at time zone zone)::date+case when hour>=(preferences->>'quietEnd')::integer then 1 else 0 end)+make_interval(hours=>(preferences->>'quietEnd')::integer)) at time zone zone;
 update public.automation_jobs set status='queued',run_at=defer_at,attempts=greatest(0,attempts-1),lease_token=null,lease_until=null,error_code='quiet_hours' where id=j.id;return;end if;
 end if;
 perform set_config('business_os.automation_depth',(e.chain_depth+1)::text,true);
 case j.action->>'kind'
 when 'notify','reminder','escalation' then
 select notification_daily_limit into quota from public.automation_settings where organization_id=j.organization_id;
 if (select count(*) from public.notifications where organization_id=j.organization_id and (created_at at time zone zone)::date=(now() at time zone zone)::date)>=coalesce(quota,500) then raise exception 'notification_daily_limit' using errcode='54000';end if;
 insert into public.notifications(organization_id,recipient_id,event_id,job_id,category,priority,title) values(j.organization_id,recipient,e.id,j.id,category,j.action->>'priority',j.action->>'title') on conflict(job_id,recipient_id) do nothing returning id into result;
 when 'followup' then
 if source->>'lead_id' is null then raise exception 'lead_required' using errcode='22023';end if;
 result=public.crm_save(j.organization_id,'lead_followups',jsonb_build_object('lead_id',source->>'lead_id','assigned_to',recipient,'due_at',now(),'followup_type','other','note',j.action->>'title'));
 when 'task' then
 select id into plan from public.execution_plans where organization_id=j.organization_id and project_id=(source->>'project_id')::uuid and status not in('cancelled','handed_over','completed') order by created_at desc,id limit 1;
 if plan is null then raise exception 'execution_plan_required' using errcode='22023';end if;
 result=public.operations_save(j.organization_id,'project_tasks',jsonb_build_object('project_id',source->>'project_id','plan_id',plan,'title',j.action->>'title','assigned_to',recipient,'priority',case j.action->>'priority' when 'urgent' then 'urgent' when 'important' then 'high' else 'normal' end,'planned_start',(now() at time zone zone)::date,'planned_end',(now() at time zone zone)::date));
 when 'assign_task' then
 if e.entity_kind<>'task' then raise exception 'task_required' using errcode='22023';end if;
 result=public.operations_save(j.organization_id,'project_tasks',jsonb_build_object('id',e.entity_id,'version',source->'version','assigned_to',recipient));
 when 'start_task' then
 if e.entity_kind<>'task' or source->>'status'<>'todo' then raise exception 'unstarted_task_required' using errcode='22023';end if;
 result=public.operations_task(j.organization_id,'task',jsonb_build_object('id',e.entity_id,'version',source->'version','status','in_progress','completion_percentage','0'));
 when 'activity' then
 if source->>'lead_id' is not null then result=public.crm_save(j.organization_id,'lead_activities',jsonb_build_object('lead_id',source->>'lead_id','activity_type','note','body',j.action->>'title'));
 elsif source->>'project_id' is not null and private.ops_access(j.organization_id,'execution.manage',(source->>'project_id')::uuid) then perform private.ops_event(j.organization_id,(source->>'project_id')::uuid,e.entity_kind,e.entity_id,'automation.activity',null,null,j.action->>'title');
 else raise exception 'activity_permission_required' using errcode='42501';end if;
 when 'email' then
 customer=case when j.action->>'audience'='customer' then (source->>'customer_id')::uuid end;
 if j.action->>'audience'='customer' and (customer is null or not exists(select 1 from public.automation_settings where organization_id=j.organization_id and customer_email_enabled) or not exists(select 1 from public.communication_consents where organization_id=j.organization_id and customer_id=customer and email_enabled)) then raise exception 'customer_consent_required' using errcode='42501';end if;
 if not exists(select 1 from public.email_templates where organization_id=j.organization_id and key=j.action->>'template') then raise exception 'email_template_required' using errcode='22023';end if;
 insert into public.email_deliveries(organization_id,job_id,event_id,recipient_id,customer_id,template_key) values(j.organization_id,j.id,e.id,case when customer is null then recipient end,customer,j.action->>'template') on conflict(job_id) do nothing returning id into result;
 else raise exception 'unsupported_action' using errcode='22023';end case;
 update public.automation_jobs set status='succeeded',result_id=result,completed_at=now(),lease_token=null,lease_until=null,error_code='' where id=j.id;
 perform private.automation_audit(j.organization_id,'automation.action.executed','automation_jobs',j.id);
end$$;
create function private.automation_run_jobs(p_limit integer default 100) returns integer language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs;old_sub text=current_setting('request.jwt.claim.sub',true);old_depth text=current_setting('business_os.automation_depth',true);processed integer=0;code text;begin
 if p_limit not between 1 and 500 then raise exception 'Invalid job bound';end if;
 for j in select * from public.automation_jobs where status in('queued','retrying') and run_at<=now() and attempts<3 order by run_at,id for update skip locked limit p_limit loop
 perform 1 from public.organizations where id=j.organization_id for update;
 update public.automation_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=j.id;
 update public.automation_executions set status='running',started_at=coalesce(started_at,now()) where id=j.execution_id;
 begin perform private.automation_execute_job(j.id);
 exception when others then
 code=case when sqlstate in('40001','40P01','53300','57P01','57014','08006') then 'transient_failure' when sqlstate='42501' then 'permission_or_recipient_unavailable' when sqlstate='54000' then 'daily_limit_reached' when sqlstate='54001' then 'chain_depth_limit' else 'invalid_action_or_source_state' end;
 update public.automation_jobs set status=case when code in('transient_failure','daily_limit_reached') and attempts<3 then 'retrying' else 'failed' end,run_at=now()+case when code='daily_limit_reached' then interval '1 day' else interval '5 minutes'*attempts end,error_code=code,completed_at=case when code not in('transient_failure','daily_limit_reached') or attempts>=3 then now() end,lease_token=null,lease_until=null where id=j.id;
 perform private.automation_audit(j.organization_id,'automation.action.failed','automation_jobs',j.id);
 end;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('business_os.automation_depth',coalesce(old_depth,'0'),true);
 update public.automation_executions x set status=case when exists(select 1 from public.automation_jobs a where a.execution_id=x.id and a.status='failed') then 'failed' when exists(select 1 from public.automation_jobs a where a.execution_id=x.id and a.status in('queued','running','retrying')) then 'queued' when exists(select 1 from public.automation_jobs a where a.execution_id=x.id and a.status='succeeded') then 'succeeded' else 'skipped' end,completed_at=case when not exists(select 1 from public.automation_jobs a where a.execution_id=x.id and a.status in('queued','running','retrying')) then now() end where x.id=j.execution_id;
 processed=processed+1;
 end loop;return processed;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('business_os.automation_depth',coalesce(old_depth,'0'),true);raise;
end$$;
create function private.automation_tick(p_worker text,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if p_worker !~ '^[a-zA-Z0-9_-]{1,80}$' or p_limit not between 1 and 500 then raise exception 'Invalid worker batch' using errcode='22023';end if;
 result=jsonb_build_object('scheduled',private.automation_scan(20),'dispatched',private.automation_dispatch(p_limit),'processed',private.automation_run_jobs(p_limit));
 insert into private.automation_worker_health(worker,last_seen_at,last_result) values(p_worker,now(),result) on conflict(worker) do update set last_seen_at=excluded.last_seen_at,last_result=excluded.last_result;return result;
end$$;
revoke all on function private.automation_dispatch(integer),private.automation_recipient_access(uuid,uuid,uuid),private.automation_execute_job(uuid),private.automation_run_jobs(integer),private.automation_tick(text,integer) from public,anon,authenticated,business_os_worker;
grant usage on schema private to business_os_worker;
grant execute on function private.automation_tick(text,integer) to business_os_worker;
commit;
