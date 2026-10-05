begin;
create function private.automation_emit(org uuid,event text,kind text,target uuid,dedupe text) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;depth integer=coalesce(nullif(current_setting('business_os.automation_depth',true),''),'0')::integer;begin
 if depth>5 then raise exception 'Automation chain limit' using errcode='54001';end if;
 insert into public.automation_events(organization_id,event_type,entity_kind,entity_id,actor_id,dedupe_key,chain_depth) values(org,event,kind,target,auth.uid(),dedupe,depth) on conflict(organization_id,dedupe_key) do nothing returning id into result;
 return result;
end$$;
create function private.automation_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb=to_jsonb(new);prior jsonb;kind text;event text;events text[]='{}';target uuid=new.id;revision text;begin
 if tg_op='UPDATE' then prior=to_jsonb(old);end if;
 select e.kind into kind from private.automation_entities e where e.table_name=tg_table_name;
 if tg_table_name='quotation_customer_responses' then
 kind='quotation';target=(r->>'revision_id')::uuid;
 events=array[case when r->>'action'='approved' then 'quotation.accepted' when r->>'action'='declined' then 'quotation.rejected' end];
 elsif tg_op='INSERT' then
 events=array[case kind when 'lead' then 'lead.created' when 'quotation' then 'quotation.created' when 'contract' then 'contract.accepted' when 'invoice' then 'invoice.created' when 'payment' then 'payment.received' when 'po' then 'po.created' when 'receipt' then 'receipt.created' when 'inventory' then 'inventory.changed' when 'task' then 'task.created' when 'inspection' then 'inspection.created' when 'snag' then 'snag.created' end];
 else
 if r->>'status' is distinct from prior->>'status' then
 event=case kind
 when 'quotation' then case when r->>'status'='issued' then 'quotation.sent' end
 when 'po' then case when r->>'status'='issued' then 'po.issued' end
 when 'task' then case r->>'status' when 'in_progress' then 'task.started' when 'blocked' then 'task.blocked' when 'done' then 'task.completed' end
 when 'milestone' then case when r->>'status'='completed' then 'milestone.completed' end
 when 'inspection' then case r->>'status' when 'failed' then 'inspection.failed' when 'requires_rework' then 'inspection.failed' when 'passed' then 'inspection.passed' end
 when 'snag' then case r->>'status' when 'reopened' then 'snag.reopened' when 'ready_for_review' then 'snag.review' when 'closed' then 'snag.closed' end
 when 'handover' then case when r->>'status'='approved' then 'handover.completed' end
 when 'project' then case when r->>'status'='completed' then 'project.completed' end
 when 'change_order' then case when r->>'status'='issued' then 'change_order.awaiting_action' end end;
 events=array_append(events,event);end if;
 if kind='lead' and r->>'stage_id' is distinct from prior->>'stage_id' then events=array_append(events,'lead.stage_changed');end if;
 if kind in('lead','task','snag') and r->>'assigned_to' is distinct from prior->>'assigned_to' and r->>'assigned_to' is not null then events=array_append(events,kind||'.assigned');end if;
 end if;
 revision=coalesce(r->>'version',r->>'updated_at',r->>'created_at',new.id::text);
 foreach event in array events loop if event is not null then perform private.automation_emit(new.organization_id,event,kind,target,tg_table_name||':'||new.id||':'||event||':'||revision);end if;end loop;
 return new;
end$$;
do $$declare t text;begin
 foreach t in array array['leads','quotation_revisions','quotation_customer_responses','contracts','invoices','payments','purchase_orders','goods_receipts','inventory_transactions','project_tasks','project_milestones','project_inspections','project_snags','handover_records','projects','change_orders'] loop
 execute format('create trigger automation_outbox after insert or update on public.%I for each row execute function private.automation_capture()',t);
 end loop;
end$$;
create function private.automation_matches(conditions jsonb,source jsonb,event_at timestamptz,clock_at timestamptz) returns boolean language plpgsql immutable set search_path='' as $$declare c jsonb;actual text;expected text;matched boolean;begin
 for c in select value from jsonb_array_elements(conditions) loop
 actual=case c->>'field' when 'days_since_event' then (extract(epoch from clock_at-event_at)/86400)::text when 'days_until_due' then (extract(epoch from (source->>'due_at')::timestamptz-clock_at)/86400)::text else source->>(c->>'field') end;
 expected=c->>'value';if actual is null then return false;end if;
 matched=case c->>'operator' when 'eq' then actual=expected when 'ne' then actual<>expected when 'gt' then actual::numeric>expected::numeric when 'lt' then actual::numeric<expected::numeric when 'gte' then actual::numeric>=expected::numeric when 'lte' then actual::numeric<=expected::numeric else false end;
 if not coalesce(matched,false) then return false;end if;end loop;return true;
end$$;
create function private.automation_shortage(org uuid,project uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare page integer=1;report jsonb;begin
 if not private.ops_access(org,'inventory.view',project) or not private.ops_access(org,'execution.view',project) then return false;end if;
 loop
 report=public.operations_materials(org,project,null,page);
 if exists(select 1 from jsonb_array_elements(report->'rows') r where (r->>'shortage')::numeric>0) then return true;end if;
 exit when page*25>=(report->>'total')::integer or page>=10000;page=page+1;
 end loop;return false;
end$$;
create function private.automation_scheduled_match(org uuid,event text,source jsonb,clock_at timestamptz) returns boolean language plpgsql stable security definer set search_path='' as $$declare due timestamptz=(source->>'due_at')::timestamptz;s text=source->>'status';begin
 return case event
 when 'lead.followup_due' then s='pending' and due<=clock_at
 when 'lead.inactive' then s='open' and (source->>'updated_at')::timestamptz<=clock_at-interval '1 day'
 when 'quotation.sent' then s='issued' and (source->>'current_revision')::boolean and coalesce(source->>'customer_response','') not in('approved','declined')
 when 'task.blocked' then s='blocked'
 when 'snag.review' then s='ready_for_review'
 when 'inspection.failed' then s in('failed','requires_rework')
 when 'change_order.awaiting_action' then s in('draft','submitted')
 when 'quotation.expired' then s='issued' and coalesce(source->>'customer_response','') not in('approved','declined') and (source->>'current_revision')::boolean and due<clock_at
 when 'invoice.due' then s='issued' and (source->>'amount')::numeric>0 and due is not null
 when 'invoice.overdue' then s='issued' and (source->>'amount')::numeric>0 and due<clock_at
 when 'po.overdue' then s in('issued','partially_received') and due<clock_at
 when 'task.overdue' then s not in('done','cancelled') and due<clock_at
 when 'milestone.approaching' then s not in('completed','cancelled') and due between clock_at and clock_at+interval '7 days'
 when 'milestone.overdue' then s not in('completed','cancelled') and due<clock_at
 when 'snag.overdue' then s not in('closed','verified') and due<clock_at
 when 'handover.ready' then s not in('cancelled','handed_over') and (private.ops_readiness(org,(source->>'project_id')::uuid)->>'ready')::boolean
 when 'material.shortage' then s not in('completed','cancelled','archived') and private.automation_shortage(org,(source->>'id')::uuid)
 else true end;
end$$;
create table private.automation_scan_state(rule_id uuid primary key references public.automation_rules(id),last_entity_id uuid,last_scan_at timestamptz not null default '-infinity');
create function private.automation_scan(p_limit integer default 20) returns integer language plpgsql security definer set search_path='' as $$
declare r public.automation_rules;def private.automation_entities;state private.automation_scan_state;target uuid;source jsonb;last_id uuid;seen integer;count_events integer=0;old_sub text=current_setting('request.jwt.claim.sub',true);zone text;begin
 if p_limit not between 1 and 100 then raise exception 'Invalid scan bound';end if;
 insert into private.automation_scan_state(rule_id) select id from public.automation_rules where status='active' on conflict do nothing;
 for state in select s.* from private.automation_scan_state s join public.automation_rules rule on rule.id=s.rule_id join private.automation_event_catalog c on c.key=rule.event_type where rule.status='active' and c.scheduled and s.last_scan_at<now()-interval '1 minute' order by s.last_scan_at,s.rule_id for update of s skip locked limit p_limit loop
 select * into r from public.automation_rules where id=state.rule_id;
 perform set_config('request.jwt.claim.sub',r.run_as::text,true);
 select default_timezone into zone from public.organizations where id=r.organization_id;
 if not private.has_permission(r.organization_id,'automation.manage') or not private.has_permission(r.organization_id,'automation.execute') then update private.automation_scan_state set last_scan_at=now() where rule_id=r.id;continue;end if;
 select e.* into def from private.automation_entities e join private.automation_event_catalog c on c.entity_kind=e.kind where c.key=r.event_type;
 seen=0;last_id=null;
 for target in execute format('select id from public.%I where organization_id=$1 and ($2::uuid is null or id>$2) order by id limit 100',def.table_name) using r.organization_id,state.last_entity_id loop
 seen=seen+1;last_id=target;source=private.automation_source(r.organization_id,def.kind,target);
 if source is not null and private.automation_scheduled_match(r.organization_id,r.event_type,source,now()) then
 if private.automation_emit(r.organization_id,r.event_type,def.kind,target,'scheduled:'||r.event_type||':'||target||':'||(now() at time zone zone)::date) is not null then count_events=count_events+1;end if;
 end if;end loop;
 update private.automation_scan_state set last_entity_id=case when seen=100 then last_id else null end,last_scan_at=now() where rule_id=r.id;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);return count_events;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);raise;
end$$;
revoke all on function private.automation_emit(uuid,text,text,uuid,text),private.automation_capture(),private.automation_matches(jsonb,jsonb,timestamptz,timestamptz),private.automation_shortage(uuid,uuid),private.automation_scheduled_match(uuid,text,jsonb,timestamptz),private.automation_scan(integer) from public,anon,authenticated,business_os_worker;
commit;
