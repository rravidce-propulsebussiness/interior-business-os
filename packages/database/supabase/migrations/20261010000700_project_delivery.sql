-- Project delivery coordinates design, customer approval and site activity.
-- Staff acknowledgements are evidence records, not customer e-signatures.
-- Private tables are not exposed through the PostgREST Data API.
begin;

create table private.site_state (
 organization_id uuid not null references public.organizations(id),
 project_id uuid primary key,
 stage text not null default 'design' check(stage in ('design','client_approved','execution','handover')),
 approval_evidence text not null default '' check(length(approval_evidence)<=3000),
 client_approval_recorded_by uuid references public.profiles(id),
 client_approval_recorded_at timestamptz,
 execution_started_at timestamptz,
 updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table private.site_team (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null,
 user_id uuid not null,
 role text not null check(role in ('manager','architect','structural_designer','site_engineer','watchman','quality_inspector','procurement')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,project_id,user_id),
 foreign key(organization_id,project_id) references public.projects(organization_id,id),
 foreign key(organization_id,user_id) references public.organization_memberships(organization_id,user_id)
);
create table private.site_designs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 kind text not null check(kind in ('architectural_plan','3d_design','structural_design')),
 revision integer not null check(revision between 1 and 1000),
 reference text not null check(length(trim(reference)) between 6 and 1500),
 notes text not null default '' check(length(notes)<=3000),
 status text not null default 'submitted' check(status in ('submitted','approved','changes_requested')),
 submitted_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 review_note text not null default '',
 created_at timestamptz not null default now(),
 unique(organization_id,project_id,kind,revision),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table private.site_reports (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 report_date date not null,
 completed_work text not null check(length(trim(completed_work)) between 5 and 5000),
 tomorrow_plan text not null check(length(trim(tomorrow_plan)) between 5 and 3000),
 blockers text not null default '' check(length(blockers)<=2000),
 checks_done text not null default '' check(length(checks_done)<=3000),
 checks_required text not null default '' check(length(checks_required)<=3000),
 worker_count integer not null default 0 check(worker_count between 0 and 10000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id),
 check(isfinite(report_date))
);
create table private.site_material_needs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 item text not null check(length(trim(item)) between 2 and 200),
 quantity numeric(16,3) not null check(quantity>0 and quantity<=100000000),
 unit text not null check(unit in ('bags','kg','tonnes','litres','nos','sqft','sqm','cft','cum','yards','metres','feet')),
 source text not null default 'undecided' check(source in ('undecided','marketplace','outside')),
 status text not null default 'requested' check(status in ('requested','approved','ordered','received','rejected')),
 vendor_reference text not null default '' check(length(vendor_reference)<=500),
 notes text not null default '' check(length(notes)<=3000),
 requested_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table private.site_checks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 title text not null check(length(trim(title)) between 3 and 200),
 due_date date,
 status text not null default 'pending' check(status in ('pending','passed','failed','recheck')),
 notes text not null default '' check(length(notes)<=3000),
 created_by uuid not null references public.profiles(id),
 checked_by uuid references public.profiles(id),
 checked_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table private.site_gate (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 kind text not null check(kind in ('material_delivery','visitor','labour','security_round','curing')),
 description text not null check(length(trim(description)) between 3 and 1500),
 notes text not null default '' check(length(notes)<=3000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table private.site_media (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 filename text not null check(length(filename) between 1 and 180),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','video/mp4','application/pdf')),
 bytes bytea not null check(octet_length(bytes) between 1 and 8388608),
 category text not null check(category in ('design','daily','site','inspection')),
 caption text not null default '' check(length(caption)<=500),
 uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table private.site_events (
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 project_id uuid not null,
 actor_id uuid not null references public.profiles(id),
 action text not null,
 record_id uuid,
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index site_team_member_index on private.site_team(organization_id,project_id,user_id) where active;
create index site_designs_recent on private.site_designs(organization_id,project_id,created_at desc);
create index site_reports_recent on private.site_reports(organization_id,project_id,report_date desc);
create index site_material_recent on private.site_material_needs(organization_id,project_id,created_at desc);
create index site_checks_recent on private.site_checks(organization_id,project_id,created_at desc);
create index site_gate_recent on private.site_gate(organization_id,project_id,created_at desc);
create index site_media_recent on private.site_media(organization_id,project_id,created_at desc);
create index site_events_recent on private.site_events(organization_id,project_id,created_at desc);

-- RLS defense in depth. No direct access is granted; all writes are checked RPCs.
do $$
declare table_name text;
begin
 foreach table_name in array array['site_state','site_team','site_designs','site_reports','site_material_needs','site_checks','site_gate','site_media','site_events'] loop
  execute format('alter table private.%I enable row level security',table_name);
  execute format('alter table private.%I force row level security',table_name);
  execute format('revoke all on private.%I from public,anon,authenticated',table_name);
 end loop;
end$$;

create function private.site_role(org uuid,project uuid) returns text
language sql stable security definer set search_path='' as $$
 select t.role from private.site_team t
 join public.organization_memberships m on m.organization_id=t.organization_id and m.user_id=t.user_id and m.status='active'
 where t.organization_id=org and t.project_id=project and t.user_id=(select auth.uid()) and t.active limit 1
$$;

create function private.site_access(org uuid,project uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_member(org) and private.entitled(org,'projects') and exists(
  select 1 from public.projects p where p.organization_id=org and p.id=project and p.status='active'
 ) and (private.has_permission(org,'project.manage') or private.site_role(org,project) is not null)
$$;

create function private.site_is_manager(org uuid,project uuid) returns boolean
language sql stable security definer set search_path='' as $
 select private.site_access(org,project) and (
  private.has_permission(org,'organization.manage') or
  private.site_role(org,project)='manager' or
  (private.site_role(org,project) is null and private.has_permission(org,'project.manage'))
 )
$;

create function private.site_allowed(org uuid,project uuid,roles text[]) returns boolean
language sql stable security definer set search_path='' as $
 select private.site_access(org,project) and (
  private.has_permission(org,'organization.manage') or
  (private.site_role(org,project) is null and private.has_permission(org,'project.manage')) or
  private.site_role(org,project)=any(roles)
 )
$;

create function private.site_log(org uuid,project uuid,action text,record_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into private.site_events(organization_id,project_id,actor_id,action,record_id)
 values(org,project,auth.uid(),action,record_id);
end$$;

create function public.project_site_read(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_role text;manager boolean;result jsonb;begin
 if not private.site_access(p_organization_id,p_project_id) then
  raise exception 'Project workspace unavailable' using errcode='42501';
 end if;
 v_role=private.site_role(p_organization_id,p_project_id);
 manager=private.site_is_manager(p_organization_id,p_project_id);
 select jsonb_build_object(
  'project',jsonb_build_object('id',p.id,'name',p.name,'code',p.code,'status',p.status),
  'stage',coalesce(s.stage,'not_started'),
  'approval_evidence',case when manager then coalesce(s.approval_evidence,'') else '' end,
  'client_approval_recorded_at',s.client_approval_recorded_at,
  'role',case when manager then 'manager' else v_role end,
  'can_manage',manager,
  'team',case when manager then coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from
    (select id,user_id,role,active,created_at from private.site_team where organization_id=p_organization_id and project_id=p_project_id) t),'[]'::jsonb) else '[]'::jsonb end,
  'member_options',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'label',coalesce(nullif(trim(pr.full_name),''),left(m.user_id::text,8))) order by pr.full_name,m.user_id) from public.organization_memberships m join public.profiles pr on pr.id=m.user_id where m.organization_id=p_organization_id and m.status='active'),'[]'::jsonb) else '[]'::jsonb end,
  'designs',case when manager or v_role in ('architect','structural_designer','site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id desc) from (select id,kind,revision,reference,notes,status,review_note,submitted_by,created_at from private.site_designs where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 60)d),'[]'::jsonb) else '[]'::jsonb end,
  'reports',case when manager or v_role in ('site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.report_date desc,d.created_at desc) from (select id,report_date,completed_work,tomorrow_plan,blockers,worker_count,checks_done,checks_required,created_at from private.site_reports where organization_id=p_organization_id and project_id=p_project_id order by report_date desc,created_at desc limit 40)d),'[]'::jsonb) else '[]'::jsonb end,
  'materials',case when manager or v_role in ('site_engineer','procurement') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,item,quantity,unit,source,status,vendor_reference,notes,created_at from private.site_material_needs where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 70)d),'[]'::jsonb) else '[]'::jsonb end,
  'checks',case when manager or v_role in ('site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,title,due_date,status,notes,checked_at,created_at from private.site_checks where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 70)d),'[]'::jsonb) else '[]'::jsonb end,
  'gate',case when manager or v_role in ('watchman','site_engineer') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,kind,description,notes,created_at from private.site_gate where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 40)d),'[]'::jsonb) else '[]'::jsonb end,
  'media',case when manager or v_role in ('architect','structural_designer','site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,filename,mime,category,caption,uploaded_by,created_at from private.site_media where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 60)d),'[]'::jsonb) else '[]'::jsonb end,
  'events',case when manager then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select actor_id,action,created_at from private.site_events where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 30)d),'[]'::jsonb) else '[]'::jsonb end
 ) into result from public.projects p left join private.site_state s on s.organization_id=p_organization_id and s.project_id=p.id where p.organization_id=p_organization_id and p.id=p_project_id;
 return result;
end$$;

create function public.project_site_command(p_organization_id uuid,p_project_id uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_stage text;v_role text;v_id uuid;v_kind text;v_revision integer;v_status text;v_member uuid;v_source text;v_row private.site_designs;v_evidence text;begin
 if not private.site_access(p_organization_id,p_project_id) then raise exception 'Project unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16000 then raise exception 'Invalid input' using errcode='22023';end if;
 -- Serialize all site transitions/approvals on the canonical project row.
 perform 1 from public.projects where organization_id=p_organization_id and id=p_project_id for update;
 select stage into v_stage from private.site_state where organization_id=p_organization_id and project_id=p_project_id;
 v_role=private.site_role(p_organization_id,p_project_id);
 if p_action='initialize' then
  if not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager required' using errcode='42501';end if;
  insert into private.site_state(organization_id,project_id) values(p_organization_id,p_project_id) on conflict(project_id) do nothing;
  perform private.site_log(p_organization_id,p_project_id,'site.initialized');
 elsif p_action='assign' then
  if not private.site_allowed(p_organization_id,p_project_id,array['manager']) or v_stage is null then raise exception 'Manager required' using errcode='42501';end if;
  if p_input-array['user_id','role','active']<>'{}'::jsonb then raise exception 'Invalid assignment' using errcode='22023';end if;
  v_member=(p_input->>'user_id')::uuid;
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=v_member and status='active') then raise exception 'Active member required' using errcode='42501';end if;
  if coalesce(p_input->>'role','') not in ('manager','architect','structural_designer','site_engineer','watchman','quality_inspector','procurement') then raise exception 'Invalid role' using errcode='22023';end if;
  insert into private.site_team(organization_id,project_id,user_id,role,active) values(p_organization_id,p_project_id,v_member,p_input->>'role',coalesce((p_input->>'active')::boolean,true))
  on conflict(organization_id,project_id,user_id) do update set role=excluded.role,active=excluded.active
  returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'team.assigned',v_id);
 elsif p_action='design_submit' then
  if v_stage is distinct from 'design' or not private.site_allowed(p_organization_id,p_project_id,array['architect','structural_designer','manager']) then raise exception 'Design phase required' using errcode='42501';end if;
  if p_input-array['kind','reference','notes']<>'{}'::jsonb then raise exception 'Invalid design input' using errcode='22023';end if;
  v_kind=p_input->>'kind';
  if v_kind not in ('architectural_plan','3d_design','structural_design') or (v_role='structural_designer' and v_kind<>'structural_design' and not private.site_is_manager(p_organization_id,p_project_id)) or (v_role='architect' and v_kind='structural_design' and not private.site_is_manager(p_organization_id,p_project_id)) then raise exception 'Design role mismatch' using errcode='42501';end if;
  if length(trim(coalesce(p_input->>'reference',''))) not between 6 and 1500 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid design reference' using errcode='22023';end if;
  if exists(select 1 from private.site_designs where organization_id=p_organization_id and project_id=p_project_id and kind=v_kind and status='submitted') then raise exception 'Review current design before revising' using errcode='23514';end if;
  select coalesce(max(revision),0)+1 into v_revision from private.site_designs where organization_id=p_organization_id and project_id=p_project_id and kind=v_kind;
  insert into private.site_designs(organization_id,project_id,kind,revision,reference,notes,submitted_by)
  values(p_organization_id,p_project_id,v_kind,v_revision,trim(p_input->>'reference'),coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'design.submitted',v_id);
 elsif p_action='design_decide' then
  if v_stage is distinct from 'design' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager review required' using errcode='42501';end if;
  if p_input-array['id','decision','note']<>'{}'::jsonb then raise exception 'Invalid design review' using errcode='22023';end if;
  v_status=p_input->>'decision';
  if v_status not in ('approved','changes_requested') then raise exception 'Invalid review decision' using errcode='22023';end if;
  select * into v_row from private.site_designs where organization_id=p_organization_id and project_id=p_project_id and id=(p_input->>'id')::uuid for update;
  if v_row.id is null or v_row.status<>'submitted' or length(coalesce(p_input->>'note',''))>3000 then raise exception 'Pending design required' using errcode='23514';end if;
  if v_status='changes_requested' and length(trim(coalesce(p_input->>'note','')))<5 then raise exception 'Explain required changes' using errcode='22023';end if;
  update private.site_designs set status=v_status,reviewed_by=auth.uid(),reviewed_at=now(),review_note=coalesce(p_input->>'note','') where id=v_row.id;
  v_id=v_row.id; perform private.site_log(p_organization_id,p_project_id,'design.'||v_status,v_id);
 elsif p_action='client_approve' then
  if v_stage is distinct from 'design' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager approval required' using errcode='42501';end if;
  if p_input-array['evidence']<>'{}'::jsonb then raise exception 'Invalid approval' using errcode='22023';end if;
  v_evidence=trim(coalesce(p_input->>'evidence',''));
  if length(v_evidence) not between 10 and 3000 then raise exception 'Record client approval evidence (minimum ten characters)' using errcode='22023';end if;
  if (select count(*) from (select distinct on(kind) kind,status from private.site_designs where organization_id=p_organization_id and project_id=p_project_id order by kind,revision desc)x where status='approved')<>3 then raise exception 'Approve latest architectural, 3D and structural revisions first' using errcode='23514';end if;
  update private.site_state set stage='client_approved',approval_evidence=v_evidence,client_approval_recorded_by=auth.uid(),client_approval_recorded_at=now(),updated_at=now() where project_id=p_project_id;
  perform private.site_log(p_organization_id,p_project_id,'client.approval_recorded');
 elsif p_action='execution_start' then
  if v_stage is distinct from 'client_approved' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Client approval required before site execution' using errcode='42501';end if;
  update private.site_state set stage='execution',execution_started_at=now(),updated_at=now() where project_id=p_project_id;
  perform private.site_log(p_organization_id,p_project_id,'execution.started');
 elsif p_action='report_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer']) then raise exception 'Site engineer required' using errcode='42501';end if;
  if p_input-array['report_date','completed_work','tomorrow_plan','blockers','checks_done','checks_required','worker_count']<>'{}'::jsonb then raise exception 'Invalid daily report' using errcode='22023';end if;
  if length(trim(coalesce(p_input->>'completed_work',''))) not between 5 and 5000 or length(trim(coalesce(p_input->>'tomorrow_plan',''))) not between 5 and 3000 or length(coalesce(p_input->>'blockers',''))>2000 or length(coalesce(p_input->>'checks_done',''))>3000 or length(coalesce(p_input->>'checks_required',''))>3000 or (p_input->>'worker_count')::integer not between 0 and 10000 then raise exception 'Invalid daily report values' using errcode='22023';end if;
  if (p_input->>'report_date')::date not between current_date-7 and current_date+1 then raise exception 'Report date outside permitted window' using errcode='22023';end if;
  insert into private.site_reports(organization_id,project_id,report_date,completed_work,tomorrow_plan,blockers,checks_done,checks_required,worker_count,created_by)
  values(p_organization_id,p_project_id,(p_input->>'report_date')::date,trim(p_input->>'completed_work'),trim(p_input->>'tomorrow_plan'),coalesce(p_input->>'blockers',''),coalesce(p_input->>'checks_done',''),coalesce(p_input->>'checks_required',''),(p_input->>'worker_count')::integer,auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'daily.reported',v_id);
 elsif p_action='material_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','procurement']) then raise exception 'Material access denied' using errcode='42501';end if;
  if p_input-array['item','quantity','unit','notes']<>'{}'::jsonb then raise exception 'Invalid material request' using errcode='22023';end if;
  if length(trim(coalesce(p_input->>'item',''))) not between 2 and 200 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid material name or notes' using errcode='22023';end if;
  insert into private.site_material_needs(organization_id,project_id,item,quantity,unit,notes,requested_by)
  values(p_organization_id,p_project_id,trim(p_input->>'item'),(p_input->>'quantity')::numeric,p_input->>'unit',coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'material.requested',v_id);
 elsif p_action='material_update' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','procurement']) then raise exception 'Procurement review required' using errcode='42501';end if;
  if p_input-array['id','status','source','vendor_reference']<>'{}'::jsonb then raise exception 'Invalid procurement action' using errcode='22023';end if;
  v_status=p_input->>'status';v_source=p_input->>'source';
  if v_status not in ('approved','ordered','received','rejected') or v_source not in ('undecided','marketplace','outside') or length(coalesce(p_input->>'vendor_reference',''))>500 then raise exception 'Invalid procurement status or source' using errcode='22023';end if;
  if v_status in ('ordered','received') and (v_source='undecided' or length(trim(coalesce(p_input->>'vendor_reference','')))<3) then raise exception 'Real seller, purchase-order or outside supplier reference required' using errcode='23514';end if;
  update private.site_material_needs set status=v_status,source=v_source,vendor_reference=coalesce(p_input->>'vendor_reference',''),reviewed_by=auth.uid(),updated_at=now()
  where organization_id=p_organization_id and project_id=p_project_id and id=(p_input->>'id')::uuid
    and ((status='requested' and v_status in ('approved','rejected'))
      or (status='approved' and v_status='ordered')
      or (status='ordered' and v_status='received'))
  returning id into v_id;
  if v_id is null then raise exception 'Invalid or stale material status transition' using errcode='40001';end if;
  perform private.site_log(p_organization_id,p_project_id,'material.'||v_status,v_id);
 elsif p_action='check_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','quality_inspector']) then raise exception 'Site checking access denied' using errcode='42501';end if;
  if p_input-array['title','due_date','notes']<>'{}'::jsonb or length(trim(coalesce(p_input->>'title',''))) not between 3 and 200 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid site check' using errcode='22023';end if;
  insert into private.site_checks(organization_id,project_id,title,due_date,notes,created_by)
  values(p_organization_id,p_project_id,trim(p_input->>'title'),nullif(p_input->>'due_date','')::date,coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'check.created',v_id);
 elsif p_action='check_update' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','quality_inspector']) then raise exception 'Checking access denied' using errcode='42501';end if;
  if p_input-array['id','status','notes']<>'{}'::jsonb then raise exception 'Invalid check action' using errcode='22023';end if;
  v_status=p_input->>'status';
  if v_status not in ('passed','failed','recheck') or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid check result' using errcode='22023';end if;
  update private.site_checks set status=v_status,notes=coalesce(p_input->>'notes',''),checked_by=auth.uid(),checked_at=now()
  where organization_id=p_organization_id and project_id=p_project_id and id=(p_input->>'id')::uuid
  and status in ('pending','failed','recheck') returning id into v_id;
  if v_id is null then raise exception 'Check already closed or unavailable' using errcode='40001';end if;
  perform private.site_log(p_organization_id,p_project_id,'check.'||v_status,v_id);
 elsif p_action='gate_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','watchman']) then raise exception 'Gate access denied' using errcode='42501';end if;
  if p_input-array['kind','description','notes']<>'{}'::jsonb or p_input->>'kind' not in ('material_delivery','visitor','labour','security_round','curing') or length(trim(coalesce(p_input->>'description',''))) not between 3 and 1500 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid gate entry' using errcode='22023';end if;
  insert into private.site_gate(organization_id,project_id,kind,description,notes,created_by)
  values(p_organization_id,p_project_id,p_input->>'kind',trim(p_input->>'description'),coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'gate.'||(p_input->>'kind'),v_id);
 elsif p_action='handover' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager required' using errcode='42501';end if;
  if exists(select 1 from private.site_checks where organization_id=p_organization_id and project_id=p_project_id and status<>'passed') or
     exists(select 1 from private.site_material_needs where organization_id=p_organization_id and project_id=p_project_id and status in ('requested','approved','ordered')) or
     coalesce((private.ops_readiness(p_organization_id,p_project_id)->>'ready')::boolean,false)=false
  then raise exception 'Complete site checks, materials and physical inspections before handover' using errcode='23514';end if;
  update private.site_state set stage='handover',updated_at=now() where project_id=p_project_id;
  perform private.site_log(p_organization_id,p_project_id,'handover.ready');
 else
  raise exception 'Unknown site command' using errcode='22023';
 end if;
 return jsonb_build_object('id',v_id,'action',p_action);
end$$;

create function public.project_site_media_put(p_organization_id uuid,p_project_id uuid,p_category text,p_filename text,p_mime text,p_base64 text,p_caption text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_bytes bytea;v_stage text;begin
 if not private.site_allowed(p_organization_id,p_project_id,array['manager','architect','structural_designer','site_engineer','quality_inspector']) then raise exception 'Media access denied' using errcode='42501';end if;
 if p_category not in ('design','daily','site','inspection') or p_mime not in ('image/jpeg','image/png','image/webp','video/mp4','application/pdf')
 or length(p_filename) not between 1 and 180 or (position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 or p_filename ~ '[[:cntrl:]]') or length(coalesce(p_caption,''))>500 or length(p_base64)>11500000 then raise exception 'Invalid media' using errcode='22023';end if;
 select stage into v_stage from private.site_state where project_id=p_project_id and organization_id=p_organization_id;
 if v_stage is null or (v_stage='design' and p_category<>'design') or (v_stage='execution' and p_category='design') or v_stage not in ('design','execution') then raise exception 'Media not permitted in this phase' using errcode='42501';end if;
 if p_category='design' and not private.site_allowed(p_organization_id,p_project_id,array['manager','architect','structural_designer']) then raise exception 'Design role required' using errcode='42501';end if;
 if p_category<>'design' and not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','quality_inspector']) then raise exception 'Site role required' using errcode='42501';end if;
 if (select count(*) from private.site_media where organization_id=p_organization_id and project_id=p_project_id)>=150 then raise exception 'Project media count limit reached' using errcode='23514';end if;
 v_bytes=decode(p_base64,'base64');
 if octet_length(v_bytes) not between 1 and 8388608 then raise exception 'Maximum file size 8 MB' using errcode='23514';end if;
 if (p_mime='image/jpeg' and (get_byte(v_bytes,0)<>255 or get_byte(v_bytes,1)<>216))
    or (p_mime='image/png' and substring(v_bytes from 1 for 4)<>decode('89504e47','hex'))
    or (p_mime='image/webp' and substring(v_bytes from 1 for 4)<>convert_to('RIFF','UTF8'))
    or (p_mime='video/mp4' and substring(v_bytes from 5 for 4)<>convert_to('ftyp','UTF8'))
    or (p_mime='application/pdf' and substring(v_bytes from 1 for 4)<>convert_to('%PDF','UTF8'))
 then raise exception 'File signature does not match type' using errcode='22023';end if;
 insert into private.site_media(organization_id,project_id,filename,mime,bytes,caption,category,uploaded_by)
 values(p_organization_id,p_project_id,p_filename,p_mime,v_bytes,coalesce(p_caption,''),p_category,auth.uid()) returning id into v_id;
 perform private.site_log(p_organization_id,p_project_id,'media.uploaded',v_id);
 return v_id;
end$$;

create function public.project_site_media_get(p_organization_id uuid,p_project_id uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m private.site_media;role text;begin
 if not private.site_access(p_organization_id,p_project_id) then raise exception 'Media not available' using errcode='42501';end if;
 role=private.site_role(p_organization_id,p_project_id);
 if not private.site_is_manager(p_organization_id,p_project_id) and role not in ('manager','architect','structural_designer','site_engineer','quality_inspector') then raise exception 'Media not available' using errcode='42501';end if;
 select * into m from private.site_media where organization_id=p_organization_id and project_id=p_project_id and id=p_id;
 if m.id is null then raise exception 'Media not found' using errcode='42501';end if;
 if m.category='design' and role in ('watchman','procurement') and not private.site_is_manager(p_organization_id,p_project_id) then raise exception 'Media not permitted' using errcode='42501';end if;
 if m.category<>'design' and role in ('architect','structural_designer') and not private.site_is_manager(p_organization_id,p_project_id) then raise exception 'Media not permitted' using errcode='42501';end if;
 return jsonb_build_object('filename',m.filename,'mime',m.mime,'base64',encode(m.bytes,'base64'));
end$$;

revoke all on function public.project_site_read(uuid,uuid),public.project_site_command(uuid,uuid,text,jsonb),public.project_site_media_put(uuid,uuid,text,text,text,text,text),public.project_site_media_get(uuid,uuid,uuid) from public,anon;
grant execute on function public.project_site_read(uuid,uuid),public.project_site_command(uuid,uuid,text,jsonb),public.project_site_media_put(uuid,uuid,text,text,text,text,text),public.project_site_media_get(uuid,uuid,uuid) to authenticated;
commit;
