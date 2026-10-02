begin;
create function private.crm_require(org uuid,permission text) returns void language plpgsql stable security definer set search_path='' as $$begin if not private.crm_access(org,permission) or not private.has_permission(org,'lead.view') then raise exception 'Forbidden' using errcode='42501';end if;end$$;
create function private.crm_assignee(org uuid,person uuid,branch uuid) returns void language plpgsql stable security definer set search_path='' as $$begin
 if branch is not null and not exists(select 1 from public.branches where organization_id=org and id=branch and status='active') then raise exception 'Invalid branch' using errcode='22023';end if;
 if person is not null and not exists(select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id=person and m.status='active' and p.status='active' and (m.branch_id is null or m.branch_id=branch)) then raise exception 'Unavailable assignee' using errcode='42501';end if;
end$$;
create function private.crm_event(org uuid,lead uuid,kind text,body text,metadata jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.lead_activities(organization_id,lead_id,activity_type,body,system_generated,metadata) values(org,lead,kind,body,true,metadata);
end$$;
create function private.crm_audit(org uuid,action text,entity text,target uuid) returns void language sql security definer set search_path='' as $$insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id) values(auth.uid(),org,action,entity,target::text);$$;
create function private.crm_requirements(org uuid,industry uuid,answers jsonb) returns void language plpgsql stable security definer set search_path='' as $$declare f public.crm_requirement_fields;k text;v jsonb;begin
 if jsonb_typeof(answers) is distinct from 'object' or octet_length(answers::text)>16000 then raise exception 'Invalid requirements' using errcode='22023';end if;
 for k,v in select * from jsonb_each(answers) loop
  select * into f from public.crm_requirement_fields where organization_id=org and key=k and active and (industry_id is null or industry_id=industry);
  if f.id is null or (f.field_type='text' and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000)) or (f.field_type='number' and jsonb_typeof(v)<>'number') or (f.field_type='boolean' and jsonb_typeof(v)<>'boolean') or (f.field_type='select' and not f.options @> jsonb_build_array(v)) then raise exception 'Invalid requirement answer' using errcode='22023';end if;
 end loop;
 if exists(select 1 from public.crm_requirement_fields where organization_id=org and active and required and (industry_id is null or industry_id=industry) and (not answers ? key or answers->key='null'::jsonb or answers->>key='')) then raise exception 'Required answer missing' using errcode='22023';end if;
end$$;

create function public.crm_save(p_organization_id uuid,p_entity text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;target uuid=coalesce((p_input->>'id')::uuid,gen_random_uuid());prior jsonb;allowed text[];permission text;columns_sql text;assignments text;k text;yr integer;counter bigint;prefix text;stage public.crm_pipeline_stages;lead public.leads;person uuid;branch uuid;action text;
begin
 perform 1 from public.organizations where id=org for update;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>40000 then raise exception 'Invalid input' using errcode='22023';end if;
 case p_entity
 when 'lead_sources' then allowed=array['name','key','active','sort_order'];permission='crm.source.manage';
 when 'crm_pipeline_stages' then allowed=array['name','key','active','sort_order','outcome'];permission='crm.pipeline.manage';
 when 'crm_lost_reasons' then allowed=array['name','key','active','sort_order'];permission='crm.pipeline.manage';
 when 'crm_requirement_fields' then allowed=array['name','key','active','sort_order','industry_id','field_type','options','required'];permission='crm.pipeline.manage';
 when 'leads' then allowed=array['name','company_name','phone','secondary_phone','email','source_id','source_detail','branch_id','industry_id','service_type','location','site_address','budget_min','budget_max','expected_start_date','project_size','priority','notes','requirements'];permission='lead.manage';
 when 'lead_activities' then allowed=array['lead_id','activity_type','subject','body','occurred_at'];permission='crm.activity.create';
 when 'lead_followups' then allowed=array['lead_id','assigned_to','due_at','followup_type','note'];permission='crm.followup.manage';
 when 'site_visits' then allowed=array['lead_id','scheduled_at','assigned_to','site_address','contact_person','notes'];permission='crm.site_visit.manage';
 else raise exception 'Invalid entity' using errcode='22023';end case;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',p_entity) into prior using org,target;
 if p_entity='leads' and prior is null then permission='lead.create';allowed=allowed||array['stage_id','assigned_to'];end if;
 perform private.crm_require(org,permission);
 if prior is not null and (prior->>'version')::integer is distinct from (p_input->>'version')::integer then raise exception 'Stale version' using errcode='40001';end if;
 if prior is null and p_input ? 'id' then raise exception 'Unavailable record' using errcode='42501';end if;
 for k in select jsonb_object_keys(p_input) loop if k not in ('id','version') and not k=any(allowed) then raise exception 'Invalid field' using errcode='22023';end if;end loop;
 p_input=p_input-'id'-'version';
 if p_entity='leads' then
  if prior->>'lifecycle'='archived' then raise exception 'Archived lead' using errcode='22023';end if;
  if p_input ? 'source_id' and not exists(select 1 from public.lead_sources where organization_id=org and id=(p_input->>'source_id')::uuid and active) then raise exception 'Inactive source' using errcode='22023';end if;
  if coalesce(p_input->>'industry_id',prior->>'industry_id') is not null and not exists(select 1 from public.organization_industries where organization_id=org and industry_id=coalesce(p_input->>'industry_id',prior->>'industry_id')::uuid) then raise exception 'Unavailable industry' using errcode='22023';end if;
  person=coalesce(p_input->>'assigned_to',prior->>'assigned_to')::uuid;branch=case when p_input ? 'branch_id' then (p_input->>'branch_id')::uuid else (prior->>'branch_id')::uuid end;
  perform private.crm_assignee(org,person,branch);
  if prior is null then
   if person is not null then perform private.crm_require(org,'lead.assign');end if;
   select * into stage from public.crm_pipeline_stages where organization_id=org and id=(p_input->>'stage_id')::uuid and active and outcome='open';
   if stage.id is null then raise exception 'Active open stage required' using errcode='22023';end if;
   yr=extract(year from current_date);
   insert into private.lead_number_sequences(organization_id,year,last_number) values(org,yr,1) on conflict(organization_id,year) do update set last_number=private.lead_number_sequences.last_number+1 returning last_number,private.lead_number_sequences.prefix into counter,prefix;
   p_input=p_input||jsonb_build_object('lead_number',prefix||'-'||yr||'-'||lpad(counter::text,6,'0'));
  end if;
  perform private.crm_requirements(org,coalesce(p_input->>'industry_id',prior->>'industry_id')::uuid,coalesce(p_input->'requirements',prior->'requirements','{}'));
 elsif p_entity in ('lead_activities','lead_followups','site_visits') then
  if prior is not null then raise exception 'Use lifecycle command' using errcode='22023';end if;
  select * into lead from public.leads where organization_id=org and id=(p_input->>'lead_id')::uuid and lifecycle<>'archived';
  if lead.id is null then raise exception 'Unavailable lead' using errcode='42501';end if;
  if p_entity='lead_activities' and (p_input->>'activity_type') not in ('note','phone_call','meeting','email_note','whatsapp_note') then raise exception 'Manual activity type required' using errcode='22023';end if;
  if p_entity<>'lead_activities' then perform private.crm_assignee(org,(p_input->>'assigned_to')::uuid,lead.branch_id);end if;
  if p_entity='site_visits' then p_input=p_input||jsonb_build_object('project_id',lead.converted_project_id);end if;
 elsif p_entity='crm_pipeline_stages' and prior is not null and p_input ? 'outcome' and p_input->>'outcome' is distinct from prior->>'outcome' and exists(select 1 from public.leads where stage_id=target) then raise exception 'Referenced stage semantics are immutable' using errcode='22023';
 elsif p_entity='crm_requirement_fields' and (p_input ? 'options') and exists(select 1 from jsonb_array_elements(p_input->'options') x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>200) then raise exception 'Invalid options' using errcode='22023';end if;
 select string_agg(format('%I',key),',' order by key),string_agg(format('%I=r.%I',key,key),',' order by key) into columns_sql,assignments from jsonb_object_keys(p_input) key;
 if columns_sql is null then raise exception 'Empty input' using errcode='22023';end if;
 if prior is null then execute format('insert into public.%1$I(id,organization_id,%2$s) select $1,$2,%2$s from jsonb_populate_record(null::public.%1$I,$3)',p_entity,columns_sql) using target,org,p_input;
 else execute format('update public.%1$I t set %2$s,version=t.version+1 from jsonb_populate_record(null::public.%1$I,$3) r where t.id=$1 and t.organization_id=$2',p_entity,assignments) using target,org,p_input;end if;
 action=case p_entity when 'leads' then 'lead' when 'lead_followups' then 'followup' when 'site_visits' then 'site_visit' else p_entity end||case when prior is null then '.created' else '.updated' end;
 perform private.crm_audit(org,action,p_entity,target);
 if p_entity='leads' then perform private.crm_event(org,target,'system',case when prior is null then 'Lead created' else 'Lead details updated' end);
 elsif p_entity='lead_followups' then
  update public.leads set next_follow_up_at=(select min(due_at) from public.lead_followups where lead_id=lead.id and status='pending'),version=version+1 where id=lead.id;
  perform private.crm_event(org,lead.id,'follow_up','Follow-up scheduled',jsonb_build_object('followup_id',target));
 elsif p_entity='site_visits' then perform private.crm_event(org,lead.id,'site_visit','Site visit scheduled',jsonb_build_object('visit_id',target));end if;
 return target;
end$$;

create function public.crm_command(p_organization_id uuid,p_action text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
<<command_state>>
declare org uuid=p_organization_id;l public.leads;s public.crm_pipeline_stages;f public.lead_followups;v public.site_visits;target uuid=(p_input->>'id')::uuid;permission text;status text;
begin
 perform 1 from public.organizations where id=org for update;
 permission=case p_action when 'assign' then 'lead.assign' when 'stage' then 'lead.manage' when 'archive' then 'lead.manage' when 'followup' then 'crm.followup.manage' when 'visit' then 'crm.site_visit.manage' else null end;
 if permission is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16000 then raise exception 'Invalid command' using errcode='22023';end if;
 perform private.crm_require(org,permission);
 if p_action in ('assign','stage','archive') then
  select * into l from public.leads where organization_id=org and id=target;
  if l.id is null then raise exception 'Unavailable lead' using errcode='42501';end if;
  if l.version is distinct from (p_input->>'version')::integer then raise exception 'Stale lead' using errcode='40001';end if;
  if l.lifecycle='archived' then raise exception 'Archived lead' using errcode='22023';end if;
  if p_action='assign' then
   perform private.crm_assignee(org,(p_input->>'assigned_to')::uuid,l.branch_id);
   update public.leads set assigned_to=(p_input->>'assigned_to')::uuid,version=version+1 where id=l.id;
   perform private.crm_event(org,l.id,'assignment_change','Lead reassigned');
  elsif p_action='archive' then update public.leads set lifecycle='archived',version=version+1 where id=l.id;perform private.crm_event(org,l.id,'system','Lead archived');
  else
   select * into s from public.crm_pipeline_stages where organization_id=org and id=(p_input->>'stage_id')::uuid and active;
   if s.id is null then raise exception 'Unavailable stage' using errcode='22023';end if;
   if s.outcome='lost' and not exists(select 1 from public.crm_lost_reasons where organization_id=org and id=(p_input->>'lost_reason_id')::uuid and active) then raise exception 'Lost reason required' using errcode='22023';end if;
   if s.outcome='won' then perform private.crm_require(org,'lead.win');if length(trim(coalesce(p_input->>'note','')))=0 then raise exception 'Won reason required' using errcode='22023';end if;end if;
   update public.leads set stage_id=s.id,stage_entered_at=now(),lifecycle=s.outcome,version=version+1,outcome_note=coalesce(p_input->>'note',''),lost_reason_id=case when s.outcome='lost' then (p_input->>'lost_reason_id')::uuid end,lost_at=case when s.outcome='lost' then now() else lost_at end,lost_by=case when s.outcome='lost' then auth.uid() else lost_by end,won_at=case when s.outcome='won' then now() else won_at end,won_by=case when s.outcome='won' then auth.uid() else won_by end where id=l.id;
   perform private.crm_event(org,l.id,case when s.outcome='lost' then 'lost_reason' else 'stage_change' end,'Stage changed to '||s.name,jsonb_build_object('stage_id',s.id,'outcome',s.outcome,'reason_id',p_input->>'lost_reason_id','note',left(coalesce(p_input->>'note',''),1000)));
  end if;
  perform private.crm_audit(org,case when p_action='assign' then 'lead.assigned' when p_action='archive' then 'lead.archived' when s.outcome='lost' then 'lead.marked_lost' else 'lead.stage_changed' end,'leads',l.id);
 elsif p_action='followup' then
  select * into f from public.lead_followups where organization_id=org and id=target;
  status=p_input->>'status';
  if f.id is null then raise exception 'Unavailable follow-up' using errcode='42501';end if;
  if status not in ('completed','cancelled') or status is null then raise exception 'Invalid status' using errcode='22023';end if;
  if f.status=status then return f.id;end if;
  if f.status<>'pending' or f.version is distinct from (p_input->>'version')::integer then raise exception 'Stale follow-up' using errcode='40001';end if;
  update public.lead_followups set status=command_state.status,completed_at=now(),completed_by=auth.uid(),outcome=coalesce(p_input->>'outcome',''),version=version+1 where id=f.id;
  update public.leads set next_follow_up_at=(select min(due_at) from public.lead_followups where lead_id=f.lead_id and lead_followups.status='pending'),version=version+1 where id=f.lead_id;
  perform private.crm_event(org,f.lead_id,'follow_up','Follow-up '||status,jsonb_build_object('followup_id',f.id));perform private.crm_audit(org,'followup.'||status,'lead_followups',f.id);
 else
  select * into v from public.site_visits where organization_id=org and id=target;
  if v.id is null then raise exception 'Unavailable visit' using errcode='42501';end if;
  status=p_input->>'status';
  if status is null or status not in ('completed','cancelled','rescheduled') then raise exception 'Invalid status' using errcode='22023';end if;
  if v.version is distinct from (p_input->>'version')::integer or v.status in ('completed','cancelled') then raise exception 'Stale visit' using errcode='40001';end if;
  if status='rescheduled' and p_input->>'scheduled_at' is null then raise exception 'New date required' using errcode='22023';end if;
  update public.site_visits set status=command_state.status,scheduled_at=coalesce((p_input->>'scheduled_at')::timestamptz,v.scheduled_at),notes=coalesce(p_input->>'notes',v.notes),outcome=coalesce(p_input->>'outcome',''),completed_at=case when command_state.status='completed' then now() end,version=version+1 where id=v.id;
  perform private.crm_event(org,v.lead_id,'site_visit','Site visit '||status,jsonb_build_object('visit_id',v.id));perform private.crm_audit(org,'site_visit.'||status,'site_visits',v.id);
 end if;
 return target;
end$$;
revoke all on function private.crm_require(uuid,text),private.crm_assignee(uuid,uuid,uuid),private.crm_event(uuid,uuid,text,text,jsonb),private.crm_audit(uuid,text,text,uuid),private.crm_requirements(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.crm_save(uuid,text,jsonb),public.crm_command(uuid,text,jsonb) from public,anon;
grant execute on function public.crm_save(uuid,text,jsonb),public.crm_command(uuid,text,jsonb) to authenticated;
commit;
