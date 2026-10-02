begin;
create function private.ops_assignee(org uuid,project uuid,person uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if person is null then return;end if;
 if not exists(select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=org and m.user_id=person and m.status='active' and p.status='active' and m.branch_id is null and exists(select 1 from public.membership_roles mr join public.role_permissions rp on rp.role_id=mr.role_id and rp.organization_id=org join public.permissions g on g.id=rp.permission_id where mr.membership_id=m.id and mr.branch_id is null and g.key='execution.view') and (exists(select 1 from public.project_execution_members pm where pm.organization_id=org and pm.project_id=project and pm.user_id=person and pm.active) or exists(select 1 from public.projects pr where pr.organization_id=org and pr.id=project and pr.assigned_user_id=person) or exists(select 1 from public.membership_roles mr join public.role_permissions rp on rp.role_id=mr.role_id and rp.organization_id=org join public.permissions g on g.id=rp.permission_id where mr.membership_id=m.id and mr.branch_id is null and g.key='execution.view_all'))) then raise exception 'Assignee requires active project access' using errcode='42501';end if;
end$$;
create function private.ops_checklist(value jsonb) returns boolean language plpgsql immutable set search_path='' as $$declare x jsonb;seen text[]='{}';begin
 if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 100 then return false;end if;
 for x in select jsonb_array_elements(value) loop
 if jsonb_typeof(x) is distinct from 'object' or x-array['key','label','required']<>'{}'::jsonb or coalesce(x->>'key','') !~ '^[a-z][a-z0-9_]{0,63}$' or length(trim(coalesce(x->>'label',''))) not between 1 and 300 or jsonb_typeof(x->'required') is distinct from 'boolean' or (x->>'key')=any(seen) then return false;end if;
 seen=array_append(seen,x->>'key');end loop;return true;
end$$;
create function private.ops_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$declare data jsonb=to_jsonb(new);project uuid=(data->>'project_id')::uuid;plan public.execution_plans;begin
 if project is not null then
 if data->>'area_id' is not null and not exists(select 1 from public.project_areas where organization_id=new.organization_id and project_id=project and id=(data->>'area_id')::uuid) then raise exception 'Area belongs to another project' using errcode='23514';end if;
 if data->>'plan_id' is not null then select * into plan from public.execution_plans where id=(data->>'plan_id')::uuid and organization_id=new.organization_id and project_id=project;
 if plan.id is null then raise exception 'Plan belongs to another project' using errcode='23514';end if;
 if tg_table_name in ('work_packages','project_milestones','project_tasks') then
 if data->>'work_package_id' is not null and not exists(select 1 from public.work_packages where id=(data->>'work_package_id')::uuid and plan_id=plan.id) or data->>'milestone_id' is not null and not exists(select 1 from public.project_milestones where id=(data->>'milestone_id')::uuid and plan_id=plan.id) then raise exception 'Schedule parent mismatch' using errcode='23514';end if;
 end if;end if;
 if data->>'scope_id' is not null and not exists(select 1 from public.execution_estimate_scope_items s join public.execution_estimate_revisions r on r.id=s.revision_id where s.id=(data->>'scope_id')::uuid and r.organization_id=new.organization_id and r.project_id=project and r.contract_id=plan.contract_id) then raise exception 'Invalid commercial scope source' using errcode='23514';end if;
 end if;return new;
end$$;
create function public.operations_save(p_organization_id uuid,p_entity text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare allowed text[];permission text;project uuid;target uuid=(p_input->>'id')::uuid;prior jsonb;body jsonb;columns text;person uuid;begin
 case p_entity
when 'project_execution_members' then permission='execution.manage';allowed=array['project_id','user_id','active'];
when 'inventory_locations' then permission='inventory.manage';allowed=array['name','kind','site_project_id','active','notes'];
when 'work_packages' then permission='execution.manage';allowed=array['project_id','plan_id','area_id','scope_id','name','source_type','source_id','scope_state','weight','notes'];
when 'project_milestones' then permission='milestone.manage';allowed=array['project_id','plan_id','name','description','sequence','owner_id','planned_start','planned_end','notes'];
when 'project_tasks' then permission='task.manage';allowed=array['project_id','plan_id','area_id','work_package_id','milestone_id','title','description','assigned_to','priority','planned_start','planned_end','weight','notes'];
when 'vendor_execution_profiles' then permission='subcontractor.manage';allowed=array['vendor_id','specialization','service_areas','active','notes'];
when 'inspection_templates' then permission='inspection.manage_templates';allowed=array['name','kind','is_final','mandatory','active','checklist'];
when 'handover_templates' then permission='handover.create';allowed=array['name','active','checklist'];
 else raise exception 'Unknown configuration' using errcode='22023';end case;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>60000 or p_input-(allowed||array['id','version'])<>'{}'::jsonb then raise exception 'Invalid configuration fields' using errcode='22023';end if;
 perform private.ops_require(p_organization_id,permission);
 if target is not null then execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 for update',p_entity) into prior using p_organization_id,target;
 if prior is null then raise exception 'Unavailable record' using errcode='42501';end if;
 if (p_input->>'version')::integer is distinct from (prior->>'version')::integer then raise exception 'Stale configuration version' using errcode='40001';end if;
 if p_input ? 'project_id' and p_input->>'project_id' is distinct from prior->>'project_id' or p_input ? 'plan_id' and p_input->>'plan_id' is distinct from prior->>'plan_id' then raise exception 'Parent cannot change' using errcode='23514';end if;
 end if;
 body=coalesce(prior,'{}')||(p_input-'id'-'version');project=(body->>'project_id')::uuid;
 if project is not null and not private.ops_project(p_organization_id,project) then raise exception 'Unavailable project' using errcode='42501';end if;
 if p_entity in ('work_packages','project_milestones','project_tasks') and not exists(select 1 from public.execution_plan_revisions where plan_id=(body->>'plan_id')::uuid and organization_id=p_organization_id and status='draft') then raise exception 'Create a draft plan revision before editing schedule structure' using errcode='40001';end if;
 if p_entity='project_tasks' then perform private.ops_assignee(p_organization_id,project,(body->>'assigned_to')::uuid);end if;
 if p_entity='project_milestones' then perform private.ops_assignee(p_organization_id,project,(body->>'owner_id')::uuid);end if;
 if p_entity='project_execution_members' and not exists(select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id and m.user_id=(body->>'user_id')::uuid and m.status='active' and p.status='active') then raise exception 'Active member required' using errcode='42501';end if;
 if p_entity in ('inspection_templates','handover_templates') and not private.ops_checklist(body->'checklist') then raise exception 'Invalid checklist template' using errcode='22023';end if;
 if p_entity='inventory_locations' and body->>'site_project_id' is not null and not private.ops_project(p_organization_id,(body->>'site_project_id')::uuid) then raise exception 'Unavailable site project' using errcode='42501';end if;
 if p_entity='inventory_locations' and prior is not null and (body->>'kind' is distinct from prior->>'kind' or body->>'site_project_id' is distinct from prior->>'site_project_id') and exists(select 1 from public.inventory_movements where location_id=target) then raise exception 'Used inventory location identity is immutable' using errcode='23514';end if;
 if p_entity='vendor_execution_profiles' and not exists(select 1 from public.vendors where organization_id=p_organization_id and id=(body->>'vendor_id')::uuid and status='active') then raise exception 'Active vendor required' using errcode='42501';end if;
 body=p_input-'id'-'version';
 if target is null then
 target=gen_random_uuid();body=body||jsonb_build_object('id',target,'organization_id',p_organization_id);
 select string_agg(quote_ident(k),',') into columns from jsonb_object_keys(body)k;
 execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1)',p_entity,columns,columns,p_entity) using body;
 else
 select string_agg(format('%I=r.%I',k,k),',') into columns from jsonb_object_keys(body)k;
 if columns is null then raise exception 'No changes supplied' using errcode='22023';end if;
 execute format('update public.%I t set %s,version=t.version+1 from jsonb_populate_record(null::public.%I,$1)r where t.id=$2 and t.organization_id=$3',p_entity,columns,p_entity) using body,target,p_organization_id;
 end if;
 perform private.ops_event(p_organization_id,project,p_entity,target,'execution.configured');return target;
end$$;
create trigger operations_reference_guard before insert or update on public.work_packages for each row execute function private.ops_reference_guard();
create trigger operations_reference_guard before insert or update on public.project_tasks for each row execute function private.ops_reference_guard();
create trigger operations_reference_guard before insert or update on public.project_milestones for each row execute function private.ops_reference_guard();
create trigger operations_reference_guard before insert or update on public.subcontractor_work_orders for each row execute function private.ops_reference_guard();
create trigger operations_reference_guard before insert or update on public.work_measurements for each row execute function private.ops_reference_guard();
create trigger operations_reference_guard before insert or update on public.project_inspections for each row execute function private.ops_reference_guard();
create trigger operations_reference_guard before insert or update on public.project_snags for each row execute function private.ops_reference_guard();
revoke all on function private.ops_assignee(uuid,uuid,uuid),private.ops_checklist(jsonb),private.ops_reference_guard(),public.operations_save(uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.operations_save(uuid,text,jsonb) to authenticated;commit;
