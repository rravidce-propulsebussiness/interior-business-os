begin;
-- Evaluate current source authorization once per distinct source/event type,
-- rather than once per historical notification. This cache exists for one query only.
create function private.automation_visible_events(org uuid,event_ids uuid[]) returns table(id uuid) language sql stable security definer set search_path='' as $$
 with candidates as materialized(select * from public.automation_events where organization_id=org and id=any(event_ids)),
 sources as materialized(select distinct entity_kind,entity_id,event_type from candidates),
 allowed as materialized(select * from sources where private.automation_source(org,entity_kind,entity_id) is not null and (event_type<>'material.shortage' or private.ops_access(org,'inventory.view',entity_id) and private.ops_access(org,'execution.view',entity_id)))
 select e.id from candidates e join allowed a using(entity_kind,entity_id,event_type);
$$;
create or replace function public.notifications_read(p_organization_id uuid,p_page integer default 1,p_status text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not private.has_permission(p_organization_id,'notification.view') then raise exception 'Unavailable notifications' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 or (p_status is not null and p_status not in('unread','read','archived')) then raise exception 'Invalid filter' using errcode='22023';end if;
 with allowed as materialized(select * from private.automation_visible_events(p_organization_id,array(select event_id from public.notifications where organization_id=p_organization_id and recipient_id=auth.uid() and (p_status is null and status<>'archived' or status=p_status)))),
 visible as materialized(select n.id,n.event_id,n.category,n.priority,n.title,n.status,n.version,n.created_at,n.read_at from public.notifications n join allowed e on e.id=n.event_id where n.organization_id=p_organization_id and n.recipient_id=auth.uid() and (p_status is null and n.status<>'archived' or n.status=p_status))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from(select * from visible order by created_at desc,id limit 25 offset(p_page-1)*25)p),'[]'),'total',(select count(*) from visible),'unread',(select count(*) from visible where status='unread'),'page',p_page) into result;
 return result;
end$$;
create function private.automation_history_read(org uuid,page integer,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not private.has_permission(org,'automation.view') then raise exception 'Unavailable automation' using errcode='42501';end if;
 if page is null or page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;
 with allowed as materialized(select * from private.automation_visible_events(org,array(select event_id from public.automation_executions where organization_id=org and (target is null or rule_id=target)))),
 visible as materialized(select x.* from public.automation_executions x join allowed e on e.id=x.event_id where x.organization_id=org and (target is null or x.rule_id=target)),
 paged as materialized(select * from visible order by created_at desc,id limit 25 offset(page-1)*25),
 rows as(select x.*,r.name rule_name,e.event_type,e.entity_kind,e.entity_id,(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'kind',j.action->>'kind','status',j.status,'run_at',j.run_at,'attempts',j.attempts,'manual_retries',j.manual_retries,'error_code',j.error_code)),'[]') from public.automation_jobs j where j.organization_id=org and j.execution_id=x.id) jobs from paged x join public.automation_rules r on r.id=x.rule_id and r.organization_id=org join public.automation_events e on e.id=x.event_id and e.organization_id=org)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(rows)) from rows),'[]'),'total',(select count(*) from visible),'page',page,'page_size',25) into result;
 return result;
end$$;
revoke all on function private.automation_visible_events(uuid,uuid[]),private.automation_history_read(uuid,integer,uuid) from public,anon,authenticated,business_os_worker;
grant execute on function private.automation_history_read(uuid,integer,uuid) to authenticated;
commit;
