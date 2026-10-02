-- Keep historical sources editable without allowing new inactive-source assignments.
begin;
create or replace function public.crm_save(p_organization_id uuid,p_entity text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
  if p_input ? 'source_id' and (prior is null or p_input->>'source_id' is distinct from prior->>'source_id') and not exists(select 1 from public.lead_sources where organization_id=org and id=(p_input->>'source_id')::uuid and active) then raise exception 'Inactive source' using errcode='22023';end if;
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


commit;
