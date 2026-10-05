begin;
create function private.automation_source(org uuid,kind text,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare def private.automation_entities;r jsonb;p public.projects;q public.quotations;lead public.leads;zone text;due timestamptz;amount numeric;allowed boolean;manager uuid;begin
 select * into def from private.automation_entities where automation_entities.kind=automation_source.kind;
 if def.kind is null then return null;end if;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',def.table_name) into r using org,target;
 if r is null then return null;end if;
 if kind='project' then select * into p from public.projects where organization_id=org and id=target;
 elsif r->>'project_id' is not null then select * into p from public.projects where organization_id=org and id=(r->>'project_id')::uuid;end if;
 allowed=case def.access_family when 'crm' then private.crm_access(org,def.permission) when 'finance' then private.finance_access(org,def.permission) when 'execution' then private.execution_access(org,def.permission) when 'operations' then private.ops_access(org,def.permission,p.id) else private.commercial_access(org,def.permission,def.module_key) end;
 if not coalesce(allowed,false) then return null;end if;
 if kind='inventory' and p.id is null and not private.has_permission(org,'inventory.view_all') then return null;end if;
 select default_timezone into zone from public.organizations where id=org;
 if kind='followup' then select * into lead from public.leads where organization_id=org and id=(r->>'lead_id')::uuid;end if;
 if kind='quotation' then select * into q from public.quotations where organization_id=org and id=(r->>'quotation_id')::uuid;select * into lead from public.leads where organization_id=org and converted_project_id=p.id order by converted_at desc,id limit 1;end if;
 select manager_id into manager from public.execution_plans where organization_id=org and project_id=p.id and status not in('cancelled','handed_over') order by created_at desc,id limit 1;
 if r->>'due_at' is not null then due=(r->>'due_at')::timestamptz;
 elsif coalesce(r->>'due_date',r->>'planned_end',r->>'delivery_date',r->>'valid_until',r->>'inspection_date') is not null then due=(coalesce(r->>'due_date',r->>'planned_end',r->>'delivery_date',r->>'valid_until',r->>'inspection_date')::date+time '09:00') at time zone zone;end if;
 amount=case kind when 'invoice' then greatest(0,(r->>'total')::numeric-private.invoice_paid(target)) when 'payment' then (r->>'amount')::numeric when 'quotation' then (r#>>'{totals,final_amount}')::numeric when 'contract' then private.contract_value(target) else null end;
 return jsonb_build_object('id',target,'kind',kind,'number',coalesce(r->>'lead_number',q.quotation_number,r->>'invoice_number',r->>'payment_number',r->>'contract_number',r->>'po_number',r->>'receipt_number',r->>'plan_number',r->>'number',''),
  'title',coalesce(r->>'title',r->>'name',lead.name,p.name,def.kind),'status',coalesce(r->>'status',r->>'lifecycle','recorded'),'priority',coalesce(r->>'priority','normal'),'version',coalesce((r->>'version')::integer,1),
  'project_id',p.id,'project_name',p.name,'project_status',p.status,'customer_id',coalesce((r->>'customer_id')::uuid,p.customer_id,q.customer_id),
  'assignee_id',coalesce((r->>'assigned_to')::uuid,(r->>'owner_id')::uuid,(r->>'inspector_id')::uuid,(r->>'manager_id')::uuid,p.assigned_user_id,lead.assigned_to),
  'manager_id',coalesce(manager,p.assigned_user_id),'lead_id',case when kind='lead' then target else coalesce(lead.id,(r->>'lead_id')::uuid) end,
  'amount',amount::text,'currency',r->>'currency','due_at',due,'created_at',r->>'created_at','updated_at',r->>'updated_at','blocked_at',r->>'blocked_at',
  'lead_source',r->>'source_id','lead_stage',r->>'stage_id','plan_id',r->>'plan_id','quotation_id',q.id,'customer_response',case when kind='quotation' then (select action from public.quotation_customer_responses where organization_id=org and revision_id=target order by responded_at desc,id desc limit 1) end,'current_revision',case when kind='quotation' then q.current_revision_id=target else true end);
end$$;
create function private.automation_event_access(org uuid,event uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare e public.automation_events;begin
 select * into e from public.automation_events where organization_id=org and id=event;
 if e.id is null or private.automation_source(org,e.entity_kind,e.entity_id) is null then return false;end if;
 if e.event_type='material.shortage' then return private.ops_access(org,'inventory.view',e.entity_id) and private.ops_access(org,'execution.view',e.entity_id);end if;
 return true;
end$$;
create function private.automation_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$declare def private.automation_entities;found boolean;begin
 select ent.* into def from private.automation_event_catalog c join private.automation_entities ent on ent.kind=c.entity_kind where c.key=new.event_type and c.entity_kind=new.entity_kind;
 if def.kind is null then raise exception 'Invalid event reference' using errcode='23514';end if;
 execute format('select exists(select 1 from public.%I where organization_id=$1 and id=$2)',def.table_name) into found using new.organization_id,new.entity_id;
 if not found then raise exception 'Invalid event owner' using errcode='23514';end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'dispatched_at') is distinct from (to_jsonb(old)-'dispatched_at') then raise exception 'Event history is immutable' using errcode='23514';end if;
 return new;
end$$;
create trigger automation_event_reference before insert or update on public.automation_events for each row execute function private.automation_reference_guard();
create trigger automation_event_retention before delete on public.automation_events for each row execute function private.ops_immutable();
create function private.automation_audit(org uuid,action text,entity text,target uuid) returns void language sql security definer set search_path='' as $$
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id) values(auth.uid(),org,action,entity,target::text);
$$;
create function private.automation_require(org uuid,permission text) returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.organizations where id=org for update;
 if not private.has_permission(org,permission) then raise exception 'Unavailable automation operation' using errcode='42501';end if;
end$$;
create function private.automation_rule_valid(config jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$declare a jsonb;c jsonb;k text;begin
 if jsonb_typeof(config) is distinct from 'object' or octet_length(config::text)>16000 or config-array['name','description','event','mode','status','conditions','actions','cooldownMinutes','maxPerEntity','dailyLimit','scheduleHour']<>'{}'::jsonb then return false;end if;
 if length(trim(coalesce(config->>'name',''))) not between 1 and 160 or length(coalesce(config->>'description',''))>1000 or not exists(select 1 from private.automation_event_catalog where key=config->>'event') then return false;end if;
 if coalesce(config->>'mode','') not in('event','delayed','scheduled','condition') or coalesce(config->>'status','') not in('active','paused','disabled','archived') then return false;end if;
 if jsonb_typeof(config->'conditions') is distinct from 'array' or jsonb_array_length(config->'conditions')>10 or jsonb_typeof(config->'actions') is distinct from 'array' or jsonb_array_length(config->'actions') not between 1 and 5 then return false;end if;
 foreach k in array array['cooldownMinutes','maxPerEntity','dailyLimit','scheduleHour'] loop if jsonb_typeof(config->k) is distinct from 'number' or config->>k !~ '^[0-9]+$' then return false;end if;end loop;
 if coalesce((config->>'cooldownMinutes')::integer,0) not between 1 and 525600 or coalesce((config->>'maxPerEntity')::integer,0) not between 1 and 20 or coalesce((config->>'dailyLimit')::integer,0) not between 1 and 1000 or coalesce((config->>'scheduleHour')::integer,-1) not between 0 and 23 then return false;end if;
 for c in select value from jsonb_array_elements(config->'conditions') loop
 if not c ?& array['field','operator','value'] or c->'value'='null'::jsonb then return false;end if;
 if jsonb_typeof(c) is distinct from 'object' or c-array['field','operator','value']<>'{}'::jsonb or coalesce(c->>'field','') not in('status','amount','days_since_event','days_until_due','project_status','lead_source','lead_stage','priority','shortage') or coalesce(c->>'operator','') not in('eq','ne','gt','lt','gte','lte') or jsonb_typeof(c->'value') not in('string','boolean') or length(c->>'value')>120 then return false;end if;
 if c->>'operator' in('gt','lt','gte','lte') and (c->>'field' not in('amount','days_since_event','days_until_due') or c->>'value' !~ '^-?[0-9]{1,18}(\.[0-9]{1,6})?$') then return false;end if;
 end loop;
 for a in select value from jsonb_array_elements(config->'actions') loop
 if jsonb_typeof(a->'delayMinutes') is distinct from 'number' or (a->>'delayMinutes') !~ '^[0-9]+$' then return false;end if;
 if jsonb_typeof(a) is distinct from 'object' or a-array['kind','recipient','userId','title','priority','delayMinutes','dueBasis','template','audience']<>'{}'::jsonb or coalesce(a->>'kind','') not in('notify','reminder','followup','task','assign_task','email','activity','escalation','start_task') or coalesce(a->>'recipient','') not in('assignee','manager','actor','user') or length(trim(coalesce(a->>'title',''))) not between 1 and 160 or coalesce(a->>'priority','') not in('info','normal','important','urgent') or coalesce((a->>'delayMinutes')::integer,-1) not between 0 and 525600 or coalesce(a->>'dueBasis','') not in('event','due_before','due_after') or coalesce(a->>'template','') !~ '^[a-z][a-z0-9_]{0,59}$' or coalesce(a->>'audience','') not in('internal','customer') then return false;end if;
 if a->>'recipient'='user' and a->>'userId' is null then return false;end if;
 if a ? 'userId' then perform (a->>'userId')::uuid;end if;
 if a->>'audience'='customer' and a->>'kind'<>'email' then return false;end if;
 end loop;return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;end$$;
alter table public.automation_rules add constraint automation_rule_configuration check(private.automation_rule_valid(configuration));
create function public.automation_rule_save(p_organization_id uuid,p_id uuid,p_version integer,p_configuration jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.automation_rules;def private.automation_entities;a jsonb;begin
 perform private.automation_require(p_organization_id,'automation.manage');
 if not private.automation_rule_valid(p_configuration) then raise exception 'Invalid structured rule' using errcode='22023';end if;
 if p_configuration->>'status'='active' and not private.has_permission(p_organization_id,'automation.execute') then raise exception 'Execution permission required' using errcode='42501';end if;
 select e.* into def from private.automation_event_catalog c join private.automation_entities e on e.kind=c.entity_kind where c.key=p_configuration->>'event';
 if not private.has_permission(p_organization_id,def.permission) or not private.entitled(p_organization_id,def.module_key) then raise exception 'Source permission required' using errcode='42501';end if;
 for a in select value from jsonb_array_elements(p_configuration->'actions') loop
 if a->>'recipient'='user' and not exists(select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id and m.user_id=(a->>'userId')::uuid and m.status='active' and p.status='active') then raise exception 'Unavailable recipient' using errcode='42501';end if;
 end loop;
 if p_id is null then
 if p_version<>0 then raise exception 'Invalid new rule version' using errcode='40001';end if;
 insert into public.automation_rules(organization_id,name,description,event_type,mode,status,configuration,run_as,created_by,updated_by) values(p_organization_id,p_configuration->>'name',coalesce(p_configuration->>'description',''),p_configuration->>'event',p_configuration->>'mode',p_configuration->>'status',p_configuration,auth.uid(),auth.uid(),auth.uid()) returning * into r;
 else
 select * into r from public.automation_rules where organization_id=p_organization_id and id=p_id for update;
 if r.id is null then raise exception 'Unavailable rule' using errcode='42501';end if;
 if r.version is distinct from p_version then raise exception 'Rule changed; reload' using errcode='40001';end if;
 update public.automation_rules set name=p_configuration->>'name',description=coalesce(p_configuration->>'description',''),event_type=p_configuration->>'event',mode=p_configuration->>'mode',status=p_configuration->>'status',configuration=p_configuration,version=version+1,run_as=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=r.id returning * into r;
 end if;
 insert into public.automation_rule_versions(organization_id,rule_id,version,configuration,created_by) values(p_organization_id,r.id,r.version,p_configuration,auth.uid());
 perform private.automation_audit(p_organization_id,'automation.rule.'||r.status,'automation_rules',r.id);
 return jsonb_build_object('id',r.id,'version',r.version);
end$$;
do $$declare t text;begin foreach t in array array['automation_settings','automation_rules','automation_rule_versions','email_templates','communication_consents'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy automation_read on public.%I for select to authenticated using(private.has_permission(organization_id,''automation.view''))',t);
end loop;
foreach t in array array['automation_events','automation_executions','automation_jobs','email_deliveries'] loop execute format('grant select on public.%I to authenticated',t);end loop;end$$;
create policy automation_event_read on public.automation_events for select to authenticated using(private.has_permission(organization_id,'automation.view') and private.automation_event_access(organization_id,id));
create policy automation_execution_read on public.automation_executions for select to authenticated using(private.has_permission(organization_id,'automation.view') and private.automation_event_access(organization_id,event_id));
create policy automation_job_read on public.automation_jobs for select to authenticated using(exists(select 1 from public.automation_executions e where e.id=execution_id));
create policy automation_email_read on public.email_deliveries for select to authenticated using(private.has_permission(organization_id,'automation.view') and private.automation_event_access(organization_id,event_id));
grant select on public.notifications,public.notification_preferences to authenticated;
create policy notification_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and private.has_permission(organization_id,'notification.view') and private.automation_event_access(organization_id,event_id));
create policy notification_preferences_read on public.notification_preferences for select to authenticated using(user_id=auth.uid() and private.has_permission(organization_id,'notification.manage_preferences'));
revoke all on function private.automation_source(uuid,text,uuid),private.automation_event_access(uuid,uuid),private.automation_reference_guard(),private.automation_audit(uuid,text,text,uuid),private.automation_require(uuid,text),private.automation_rule_valid(jsonb),public.automation_rule_save(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.automation_event_access(uuid,uuid),public.automation_rule_save(uuid,uuid,integer,jsonb) to authenticated;
commit;
