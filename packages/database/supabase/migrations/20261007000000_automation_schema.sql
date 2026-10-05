begin;
-- No worker identity is a tenant user or a service-role credential.
do $$begin if not exists(select 1 from pg_roles where rolname='business_os_worker') then create role business_os_worker nologin noinherit;end if;end$$;
create table private.automation_entities(kind text primary key,table_name text not null unique,permission text not null,module_key text not null,access_family text not null check(access_family in('crm','commercial','finance','execution','operations')),category text not null);
insert into private.automation_entities values
 ('lead','leads','lead.view','crm','crm','crm'),('followup','lead_followups','lead.view','crm','crm','crm'),
 ('quotation','quotation_revisions','quotation.view','quotation','commercial','quotation'),
 ('contract','contracts','contract.view','billing','finance','billing'),('invoice','invoices','invoice.view','billing','finance','billing'),('payment','payments','payment.view','billing','finance','payment'),
 ('po','purchase_orders','purchase_order.view','purchasing','execution','procurement'),('receipt','goods_receipts','goods_receipt.view','purchasing','execution','procurement'),
 ('inventory','inventory_transactions','inventory.view','purchasing','operations','inventory'),
 ('task','project_tasks','task.view','projects','operations','execution'),('milestone','project_milestones','milestone.view','projects','operations','execution'),
 ('inspection','project_inspections','inspection.view','projects','operations','inspection'),('snag','project_snags','snag.view','projects','operations','snag'),
 ('handover','handover_records','handover.view','projects','operations','handover'),('plan','execution_plans','execution.view','projects','operations','handover'),
 ('project','projects','project.view','projects','commercial','execution'),('change_order','change_orders','change_order.view','billing','finance','billing');
create table private.automation_event_catalog(key text primary key,entity_kind text not null references private.automation_entities(kind),scheduled boolean not null default false);
insert into private.automation_event_catalog(key,entity_kind,scheduled) values
 ('lead.created','lead',false),('lead.stage_changed','lead',false),('lead.assigned','lead',false),('lead.followup_due','followup',true),('lead.inactive','lead',true),
 ('quotation.created','quotation',false),('quotation.sent','quotation',false),('quotation.accepted','quotation',false),('quotation.rejected','quotation',false),('quotation.expired','quotation',true),
 ('contract.accepted','contract',false),('invoice.created','invoice',false),('invoice.due','invoice',true),('invoice.overdue','invoice',true),('payment.received','payment',false),
 ('po.created','po',false),('po.issued','po',false),('po.overdue','po',true),('receipt.created','receipt',false),('material.shortage','project',true),('inventory.changed','inventory',false),
 ('task.created','task',false),('task.assigned','task',false),('task.started','task',false),('task.blocked','task',false),('task.overdue','task',true),('task.completed','task',false),
 ('milestone.approaching','milestone',true),('milestone.overdue','milestone',true),('milestone.completed','milestone',false),
 ('inspection.created','inspection',false),('inspection.failed','inspection',false),('inspection.passed','inspection',false),
 ('snag.created','snag',false),('snag.assigned','snag',false),('snag.overdue','snag',true),('snag.reopened','snag',false),('snag.review','snag',false),('snag.closed','snag',false),
 ('handover.ready','plan',true),('handover.completed','handover',false),('project.completed','project',false),('change_order.awaiting_action','change_order',false);

create table public.automation_settings(
 organization_id uuid primary key references public.organizations(id),version integer not null default 1,
 notification_daily_limit integer not null default 500 check(notification_daily_limit between 1 and 10000),
 email_daily_limit integer not null default 100 check(email_daily_limit between 1 and 1000),
 customer_email_enabled boolean not null default false,retention_days integer not null default 365 check(retention_days between 30 and 3650),
 updated_by uuid references public.profiles(id),updated_at timestamptz not null default now());
create table public.automation_rules(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null,description text not null default '',event_type text not null references private.automation_event_catalog(key),
 mode text not null check(mode in('event','delayed','scheduled','condition')),status text not null check(status in('active','paused','disabled','archived')),
 configuration jsonb not null,version integer not null default 1 check(version>0),
 run_as uuid not null,created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,run_as) references public.organization_memberships(organization_id,user_id));
create table public.automation_rule_versions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,rule_id uuid not null,version integer not null,configuration jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(rule_id,version),unique(organization_id,id),
 foreign key(organization_id,rule_id) references public.automation_rules(organization_id,id));
create table public.automation_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),event_type text not null references private.automation_event_catalog(key),
 entity_kind text not null references private.automation_entities(kind),entity_id uuid not null,actor_id uuid references public.profiles(id),
 occurred_at timestamptz not null default now(),chain_depth integer not null default 0 check(chain_depth between 0 and 5),dedupe_key text not null,
 dispatched_at timestamptz,unique(organization_id,dedupe_key),unique(organization_id,id));
create table public.automation_executions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,rule_id uuid not null,rule_version_id uuid not null,event_id uuid not null,
 status text not null default 'queued' check(status in('queued','running','succeeded','skipped','retrying','failed','cancelled')),
 created_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,reason text not null default '',
 unique(rule_id,event_id),unique(organization_id,id),
 foreign key(organization_id,rule_id) references public.automation_rules(organization_id,id),
 foreign key(organization_id,rule_version_id) references public.automation_rule_versions(organization_id,id),
 foreign key(organization_id,event_id) references public.automation_events(organization_id,id));
create table public.automation_jobs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,execution_id uuid not null,action_index integer not null check(action_index between 0 and 4),
 action jsonb not null,run_at timestamptz not null,status text not null default 'queued' check(status in('queued','running','succeeded','skipped','retrying','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 3),lease_token uuid,lease_until timestamptz,
 result_id uuid,error_code text not null default '',created_at timestamptz not null default now(),completed_at timestamptz,
 unique(execution_id,action_index),unique(organization_id,id),foreign key(organization_id,execution_id) references public.automation_executions(organization_id,id));
create table public.notifications(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),recipient_id uuid not null,
 event_id uuid not null,job_id uuid not null,category text not null,priority text not null check(priority in('info','normal','important','urgent')),
 title text not null check(length(title) between 1 and 160),status text not null default 'unread' check(status in('unread','read','archived')),
 version integer not null default 1,created_at timestamptz not null default now(),read_at timestamptz,unique(job_id,recipient_id),unique(organization_id,id),
 foreign key(organization_id,recipient_id) references public.organization_memberships(organization_id,user_id),
 foreign key(organization_id,event_id) references public.automation_events(organization_id,id),foreign key(organization_id,job_id) references public.automation_jobs(organization_id,id));
create table public.notification_preferences(
 organization_id uuid not null references public.organizations(id),user_id uuid not null,configuration jsonb not null,version integer not null default 1,
 updated_at timestamptz not null default now(),primary key(organization_id,user_id),foreign key(organization_id,user_id) references public.organization_memberships(organization_id,user_id));
create table public.email_templates(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),key text not null,subject text not null,body text not null,
 version integer not null default 1,updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),unique(organization_id,key),unique(organization_id,id));
create table public.communication_consents(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),customer_id uuid not null,
 email_enabled boolean not null default false,evidence text not null check(length(evidence) between 3 and 1000),version integer not null default 1,
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),unique(organization_id,customer_id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id));
create table public.email_deliveries(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,job_id uuid not null unique,event_id uuid not null,
 recipient_id uuid,customer_id uuid,template_key text not null,status text not null default 'queued' check(status in('queued','sending','sent','retrying','failed','skipped','uncertain')),
 attempts integer not null default 0 check(attempts between 0 and 3),lease_token uuid,lease_until timestamptz,next_attempt_at timestamptz not null default now(),
 provider_message_id text,error_code text not null default '',created_at timestamptz not null default now(),sent_at timestamptz,unique(organization_id,id),
 check((recipient_id is null)<>(customer_id is null)),
 foreign key(organization_id,recipient_id) references public.organization_memberships(organization_id,user_id),foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,job_id) references public.automation_jobs(organization_id,id),foreign key(organization_id,event_id) references public.automation_events(organization_id,id));
create table public.report_snapshots(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),kind text not null,filters jsonb not null,
 data jsonb not null,renderer_version integer not null default 1,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(organization_id,id));
create table private.automation_worker_health(worker text primary key,last_seen_at timestamptz not null,last_result jsonb not null default '{}');
create table private.automation_scheduler_cursor(organization_id uuid primary key references public.organizations(id),last_scan_at timestamptz not null default '-infinity');
create index automation_outbox_pending on public.automation_events(occurred_at,id) where dispatched_at is null;
create index automation_rules_event on public.automation_rules(organization_id,event_type) where status='active';
create index automation_history_page on public.automation_executions(organization_id,created_at desc,id);
create index automation_jobs_due on public.automation_jobs(run_at,id) where status in('queued','retrying','running');
create index notifications_recipient_page on public.notifications(organization_id,recipient_id,created_at desc,id);
create index notifications_unread on public.notifications(organization_id,recipient_id) where status='unread';
create index automation_email_due on public.email_deliveries(next_attempt_at,id) where status in('queued','retrying','sending');
create index report_snapshots_page on public.report_snapshots(organization_id,created_at desc,id);
create trigger automation_version_immutable before update or delete on public.automation_rule_versions for each row execute function private.ops_immutable();
create trigger report_snapshot_immutable before update or delete on public.report_snapshots for each row execute function private.ops_immutable();
do $$declare t text;begin foreach t in array array['automation_settings','automation_rules','automation_rule_versions','automation_events','automation_executions','automation_jobs','notifications','notification_preferences','email_templates','communication_consents','email_deliveries','report_snapshots'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,business_os_worker',t);
end loop;end$$;
revoke all on all tables in schema private from business_os_worker;
do $$declare k text;r text;begin
 foreach k in array array['automation.view','automation.manage','automation.execute','automation.retry','notification.view','notification.manage_preferences','report.crm.view','report.sales.view','report.billing.view','report.project.view','report.procurement.view','report.inventory.view','report.execution.view','report.cost.view','report.export'] loop
 insert into public.permissions(key,scope,description) values(k,'organization',k) on conflict(key) do nothing;
 foreach r in array array['owner','admin'] loop
 insert into private.role_template_permissions(role_key,permission_key) values(r,k) on conflict do nothing;
 insert into public.role_permissions(organization_id,role_id,permission_id) select roles.organization_id,roles.id,p.id from public.roles roles join public.permissions p on p.key=k where roles.key=r on conflict do nothing;
 end loop;end loop;
 -- Notifications carry no implicit source permission. Individual records are checked live.
 foreach k in array array['notification.view','notification.manage_preferences'] loop
 insert into private.role_template_permissions(role_key,permission_key) select key,k from private.role_templates on conflict do nothing;
 insert into public.role_permissions(organization_id,role_id,permission_id) select roles.organization_id,roles.id,p.id from public.roles roles join public.permissions p on p.key=k on conflict do nothing;
 end loop;
end$$;
commit;
