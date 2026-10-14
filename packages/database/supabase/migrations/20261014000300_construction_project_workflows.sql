-- Construction OS Phase 2: project-scoped multi-roles and persistent planning
-- definitions. NO physical-stage approvals, payment writes or client access.
-- All records are additive and tenant-scoped; older Site Delivery RPCs remain.
begin;

create table private.construction_project_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  role text not null check (role in (
    'project_director','project_manager','architect','structural_engineer',
    'site_engineer','supervisor','quality_inspector','watchman','procurement',
    'storekeeper','electrical_engineer','plumbing_engineer','mep_engineer',
    'quantity_surveyor','accounts_officer','contractor'
  )),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  assigned_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,project_id,user_id,role),
  unique (organization_id,project_id,id),
  foreign key (organization_id,project_id) references public.projects(organization_id,id),
  foreign key (organization_id,user_id) references public.organization_memberships(organization_id,user_id)
);
create index construction_roles_by_user on private.construction_project_roles(organization_id,project_id,user_id) where active;

create table private.construction_role_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  project_id uuid not null,
  assignment_id uuid not null,
  role text not null,
  user_id uuid not null,
  active boolean not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  foreign key(organization_id,project_id,assignment_id)
    references private.construction_project_roles(organization_id,project_id,id),
  foreign key(organization_id,project_id) references public.projects(organization_id,id)
);

-- An approved project can have one frozen construction planning snapshot.
-- This is deliberately NOT a new task, progress, inspection or milestone engine.
create table private.construction_project_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  template_code text not null check (template_code ~ '^[A-Z][A-Z0-9_]{0,49}$'),
  template_version text not null check (template_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot)='object'),
  floor_snapshot jsonb not null check (jsonb_typeof(floor_snapshot)='array'),
  status text not null default 'planning' check (status in ('planning','frozen')),
  version integer not null default 1 check (version>0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id,project_id),
  unique (organization_id,project_id,id),
  foreign key (organization_id,project_id) references public.projects(organization_id,id)
);
create table private.construction_project_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  workflow_id uuid not null,
  instance_code text not null check(instance_code ~ '^[A-Z][A-Z0-9_]*(/[A-Z][A-Z0-9_]*)?$' and length(instance_code)<=120),
  template_code text not null check(template_code ~ '^[A-Z][A-Z0-9_]{0,49}$'),
  phase text not null check(phase in (
    'preconstruction','design','site_preparation','foundation','plinth',
    'superstructure','masonry','finishes','handover')),
  floor_code text check (floor_code ~ '^[A-Z][A-Z0-9_]{0,49}$'),
  title text not null check(length(trim(title)) between 3 and 180),
  explanation text not null default '' check(length(explanation)<=800),
  hold_point text check(hold_point in ('contract','client_design','quality','structural','handover')),
  activities jsonb not null check(jsonb_typeof(activities)='array' and jsonb_array_length(activities) between 1 and 80),
  inspection_topics jsonb not null check(jsonb_typeof(inspection_topics)='array' and jsonb_array_length(inspection_topics)<=50),
  status text not null default 'not_started' check(status='not_started'),
  sequence integer not null check(sequence between 1 and 900),
  created_at timestamptz not null default now(),
  unique (organization_id,project_id,sequence),
  unique (organization_id,project_id,instance_code),
  unique (organization_id,project_id,id),
  foreign key (organization_id,project_id,workflow_id)
    references private.construction_project_workflows(organization_id,project_id,id),
  foreign key (organization_id,project_id) references public.projects(organization_id,id)
);
create table private.construction_stage_dependencies (
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  predecessor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(stage_id,predecessor_id),
  check(stage_id<>predecessor_id),
  foreign key(organization_id,project_id,stage_id)
    references private.construction_project_stages(organization_id,project_id,id),
  foreign key(organization_id,project_id,predecessor_id)
    references private.construction_project_stages(organization_id,project_id,id)
);
create table private.construction_stage_tasks (
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  task_id uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(organization_id,project_id,task_id),
  foreign key(organization_id,project_id,stage_id)
    references private.construction_project_stages(organization_id,project_id,id),
  foreign key(organization_id,project_id,task_id)
    references public.project_tasks(organization_id,project_id,id)
);

do $$
declare t text;
begin
 foreach t in array array['construction_project_roles','construction_role_history',
   'construction_project_workflows','construction_project_stages',
   'construction_stage_dependencies','construction_stage_tasks'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('alter table private.%I force row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end$$;

create function private.construction_project_access(org uuid, project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(org) and private.entitled(org,'projects')
   and exists(select 1 from public.projects p
     where p.organization_id=org and p.id=project and p.status='active')
   and (private.site_access(org,project)
     or exists(select 1 from private.construction_project_roles r
       where r.organization_id=org and r.project_id=project
         and r.user_id=(select auth.uid()) and r.active));
$$;

create function private.construction_can_manage(org uuid, project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.construction_project_access(org,project)
   and (private.site_owner(org)
     or private.site_role(org,project)='manager'
     or exists(select 1 from private.construction_project_roles r
        where r.organization_id=org and r.project_id=project
          and r.user_id=(select auth.uid()) and r.active
          and r.role in ('project_director','project_manager'))
     -- Explicitly assigned restricted construction roles take precedence over
     -- unrelated organization-level project.manage grants.
     or (not exists(select 1 from private.construction_project_roles r
         where r.organization_id=org and r.project_id=project
           and r.user_id=(select auth.uid()) and r.active)
       and private.site_is_manager(org,project)));
$$;

create function public.construction_project_read(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean; roles jsonb; workflow jsonb; stages jsonb;
begin
 if not private.construction_project_access(p_organization_id,p_project_id)
 then raise exception 'Project unavailable' using errcode='42501';end if;
 manager=private.construction_can_manage(p_organization_id,p_project_id);
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'user_id',r.user_id,'role',r.role,'active',r.active,'version',r.version)
   order by r.user_id,r.role),'[]'::jsonb) into roles
 from private.construction_project_roles r
 where r.organization_id=p_organization_id and r.project_id=p_project_id
  and (manager or (r.user_id=auth.uid() and r.active));
 select jsonb_build_object('id',w.id,'template_code',w.template_code,
    'template_version',w.template_version,'status',w.status,'version',w.version,
    'floor_snapshot',w.floor_snapshot) into workflow
 from private.construction_project_workflows w
 where w.organization_id=p_organization_id and w.project_id=p_project_id;
 -- Watchmen see their own assignment, not structural plans or other staff.
 if not manager and not exists (
    select 1 from private.construction_project_roles r
    where r.organization_id=p_organization_id and r.project_id=p_project_id
      and r.user_id=auth.uid() and r.active
      and r.role not in ('watchman','accounts_officer')
 ) and private.site_role(p_organization_id,p_project_id) in ('watchman')
 then
   stages='[]'::jsonb;
 elsif not manager and exists (
    select 1 from private.construction_project_roles r
    where r.organization_id=p_organization_id and r.project_id=p_project_id
      and r.user_id=auth.uid() and r.active
      and r.role in ('watchman','accounts_officer')
 ) and not exists (
    select 1 from private.construction_project_roles r
    where r.organization_id=p_organization_id and r.project_id=p_project_id
      and r.user_id=auth.uid() and r.active
      and r.role not in ('watchman','accounts_officer')
 ) then
   stages='[]'::jsonb;
 else
   select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'instance_code',s.instance_code,'template_code',s.template_code,
      'phase',s.phase,'floor_code',s.floor_code,'title',s.title,
      'explanation',s.explanation,'hold_point',s.hold_point,
      'activities',s.activities,'inspection_topics',s.inspection_topics,
      'status',s.status,'task_count',(
        select count(*) from private.construction_stage_tasks st
        where st.organization_id=s.organization_id and st.project_id=s.project_id
        and st.stage_id=s.id),
      'dependencies',coalesce((select jsonb_agg(pred.instance_code order by pred.instance_code)
        from private.construction_stage_dependencies d
        join private.construction_project_stages pred
          on pred.organization_id=d.organization_id and pred.project_id=d.project_id
          and pred.id=d.predecessor_id
        where d.stage_id=s.id and d.organization_id=s.organization_id
          and d.project_id=s.project_id),'[]'::jsonb)
      ) order by s.sequence),'[]'::jsonb) into stages
   from private.construction_project_stages s
   where s.organization_id=p_organization_id and s.project_id=p_project_id;
 end if;
 return jsonb_build_object('can_manage',manager,
     'workflow',workflow,'roles',roles,'stages',stages);
end$$;

create function public.construction_project_command(
 p_organization_id uuid,p_project_id uuid,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 id_result uuid; target_user uuid; v_role text; v_row private.construction_project_roles;
 item jsonb; code text; prerequisite text; count_items integer;
 cycle_found boolean; workflow_id uuid;
begin
 if not private.construction_can_manage(p_organization_id,p_project_id)
 then raise exception 'Project management permission required' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>800000
    or p_action not in ('role_assign','role_deactivate','workflow_create','task_link')
 then raise exception 'Invalid construction command' using errcode='22023';end if;
 -- Serialize concurrent assignments, workflow initialization and task mappings.
 perform 1 from public.projects
  where organization_id=p_organization_id and id=p_project_id and status='active'
  for update;
 if not found then raise exception 'Project not found' using errcode='42501';end if;

 if p_action='role_assign' then
  if p_input-array['user_id','role']<>'{}'::jsonb
    then raise exception 'Invalid role assignment' using errcode='22023';end if;
  target_user=(p_input->>'user_id')::uuid;
  v_role=p_input->>'role';
  if v_role not in ('project_director','project_manager','architect',
    'structural_engineer','site_engineer','supervisor','quality_inspector',
    'watchman','procurement','storekeeper','electrical_engineer',
    'plumbing_engineer','mep_engineer','quantity_surveyor',
    'accounts_officer','contractor')
  then raise exception 'Unknown internal project role' using errcode='22023';end if;
  if v_role='project_director' and not private.site_owner(p_organization_id)
  then raise exception 'Company owner required to grant director' using errcode='42501';end if;
  if not exists(select 1 from public.organization_memberships
    where organization_id=p_organization_id and user_id=target_user and status='active')
  then raise exception 'Active company member required' using errcode='42501';end if;
  insert into private.construction_project_roles (
    organization_id,project_id,user_id,role,assigned_by,updated_by
  ) values(p_organization_id,p_project_id,target_user,v_role,auth.uid(),auth.uid())
  on conflict (organization_id,project_id,user_id,role) do update
    set active=true,version=private.construction_project_roles.version+1,
        updated_by=auth.uid(),updated_at=now()
    where not private.construction_project_roles.active
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from private.construction_project_roles
    where organization_id=p_organization_id and project_id=p_project_id
      and user_id=target_user and role=v_role;
  else
    insert into private.construction_role_history(
      organization_id,project_id,assignment_id,role,user_id,active,changed_by
    ) values(p_organization_id,p_project_id,v_row.id,v_role,target_user,true,auth.uid());
    perform private.site_log(p_organization_id,p_project_id,'construction.role_assigned',v_row.id);
  end if;
  id_result=v_row.id;
 elsif p_action='role_deactivate' then
  if p_input-array['id','version']<>'{}'::jsonb then
    raise exception 'Invalid role removal' using errcode='22023';end if;
  select * into v_row from private.construction_project_roles
    where organization_id=p_organization_id and project_id=p_project_id
      and id=(p_input->>'id')::uuid for update;
  if v_row.id is null or not v_row.active or
    v_row.version is distinct from (p_input->>'version')::integer
  then raise exception 'Stale or missing project role' using errcode='40001';end if;
  if v_row.role='project_director' and not private.site_owner(p_organization_id)
  then raise exception 'Company owner required' using errcode='42501';end if;
  update private.construction_project_roles set active=false,
    version=version+1,updated_by=auth.uid(),updated_at=now() where id=v_row.id;
  insert into private.construction_role_history(
    organization_id,project_id,assignment_id,role,user_id,active,changed_by
  ) values(p_organization_id,p_project_id,v_row.id,v_row.role,v_row.user_id,false,auth.uid());
  id_result=v_row.id;
  perform private.site_log(p_organization_id,p_project_id,'construction.role_deactivated',v_row.id);

 elsif p_action='workflow_create' then
  if p_input-array['template','floors','stages']<>'{}'::jsonb or
      jsonb_typeof(p_input->'template') is distinct from 'object' or
      p_input->'template'->>'industry' is distinct from 'construction' or
      jsonb_typeof(p_input->'floors') is distinct from 'array' or
      jsonb_array_length(p_input->'floors') not between 1 and 64 or
      jsonb_typeof(p_input->'stages') is distinct from 'array' or
      jsonb_array_length(p_input->'stages') not between 1 and 900
  then raise exception 'Invalid construction workflow' using errcode='22023';end if;
  if exists(select 1 from private.construction_project_workflows
    where organization_id=p_organization_id and project_id=p_project_id)
  then raise exception 'Project workflow already exists; preserve approved snapshot'
    using errcode='23505';end if;
  -- Project's complete blueprint is frozen; defaults cannot mutate it.
  insert into private.construction_project_workflows(
    organization_id,project_id,template_code,template_version,
    template_snapshot,floor_snapshot,created_by
  ) values(p_organization_id,p_project_id,'CONSTRUCTION_STANDARD',
      p_input->'template'->>'version',p_input->'template',
      p_input->'floors',auth.uid()) returning id into workflow_id;
  count_items=0;
  for item in select value from jsonb_array_elements(p_input->'stages') loop
    count_items=count_items+1;
    if jsonb_typeof(item) is distinct from 'object' or
      item- array['instanceCode','templateCode','phase','title','explanation',
        'floorCode','dependsOn','holdPoint','activities','inspectionTopics'] <> '{}'::jsonb
      or length(coalesce(item->>'instanceCode','')) not between 1 and 120
      or jsonb_typeof(item->'dependsOn') is distinct from 'array'
      or jsonb_array_length(item->'dependsOn')>40
      or jsonb_typeof(item->'activities') is distinct from 'array'
      or jsonb_typeof(item->'inspectionTopics') is distinct from 'array'
    then raise exception 'Invalid stage definition' using errcode='22023';end if;
    insert into private.construction_project_stages (
      organization_id,project_id,workflow_id,instance_code,template_code,
      phase,floor_code,title,explanation,hold_point,activities,inspection_topics,sequence
    ) values (p_organization_id,p_project_id,workflow_id,
       item->>'instanceCode',item->>'templateCode',item->>'phase',
       nullif(item->>'floorCode',''),item->>'title',item->>'explanation',
       nullif(item->>'holdPoint',''),item->'activities',item->'inspectionTopics',count_items);
  end loop;
  for item in select value from jsonb_array_elements(p_input->'stages') loop
   select id into id_result from private.construction_project_stages
   where organization_id=p_organization_id and project_id=p_project_id
     and instance_code=item->>'instanceCode';
   for prerequisite in select value from jsonb_array_elements_text(item->'dependsOn') loop
    insert into private.construction_stage_dependencies(
      organization_id,project_id,stage_id,predecessor_id
    ) select p_organization_id,p_project_id,id_result,s.id
      from private.construction_project_stages s
      where s.organization_id=p_organization_id and s.project_id=p_project_id
        and s.instance_code=prerequisite;
    if not found then raise exception 'Unknown stage prerequisite: %',prerequisite
      using errcode='23514';end if;
   end loop;
  end loop;
  with recursive chain(start_id,node_id,path,cyclic) as (
    select d.stage_id,d.predecessor_id,array[d.stage_id,d.predecessor_id],
       (d.stage_id=d.predecessor_id)
    from private.construction_stage_dependencies d
    where d.organization_id=p_organization_id and d.project_id=p_project_id
    union all
    select c.start_id,d.predecessor_id,c.path||d.predecessor_id,
      d.predecessor_id=any(c.path)
    from chain c join private.construction_stage_dependencies d
      on d.stage_id=c.node_id and d.organization_id=p_organization_id
      and d.project_id=p_project_id
    where not c.cyclic
  )
  select exists(select 1 from chain where cyclic) into cycle_found;
  if cycle_found then raise exception 'Circular construction stage dependencies'
     using errcode='23514';end if;
  id_result=workflow_id;
  perform private.site_log(p_organization_id,p_project_id,'construction.workflow_created',workflow_id);

 elsif p_action='task_link' then
  if p_input-array['stage_id','task_id']<>'{}'::jsonb
  then raise exception 'Invalid task mapping' using errcode='22023';end if;
  if not exists(select 1 from private.construction_project_stages
       where organization_id=p_organization_id and project_id=p_project_id
         and id=(p_input->>'stage_id')::uuid)
     or not exists(select 1 from public.project_tasks
       where organization_id=p_organization_id and project_id=p_project_id
         and id=(p_input->>'task_id')::uuid)
  then raise exception 'Matching project stage and existing Operations task required'
    using errcode='42501';end if;
  insert into private.construction_stage_tasks(
    organization_id,project_id,stage_id,task_id,created_by
  ) values(p_organization_id,p_project_id,
    (p_input->>'stage_id')::uuid,(p_input->>'task_id')::uuid,auth.uid())
  on conflict(organization_id,project_id,task_id) do nothing;
  id_result=(p_input->>'stage_id')::uuid;
  perform private.site_log(p_organization_id,p_project_id,'construction.task_linked',id_result);
 end if;
 return jsonb_build_object('id',id_result,'action',p_action);
end$$;

revoke all on function private.construction_project_access(uuid,uuid),
 private.construction_can_manage(uuid,uuid),
 public.construction_project_read(uuid,uuid),
 public.construction_project_command(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.construction_project_read(uuid,uuid),
 public.construction_project_command(uuid,uuid,text,jsonb) to authenticated;
commit;
