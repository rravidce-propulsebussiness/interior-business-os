-- Construction OS Phase 3: contractual evidence and fail-closed execution gates.
-- No signed-document bytes, money or immutable contract snapshots are rewritten.
begin;

-- Separate commercial agreement PDFs from design imagery: architects and
-- site engineers must not inherit access to signed agreements.
alter table private.site_media drop constraint site_media_category_check;
alter table private.site_media add constraint site_media_category_check
 check(category in ('design','daily','site','inspection','agreement'));

create or replace function public.project_site_read(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $
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
  'media',case when manager or v_role in ('architect','structural_designer','site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,filename,mime,category,caption,uploaded_by,created_at from private.site_media where organization_id=p_organization_id and project_id=p_project_id and (category<>'agreement' or (manager and private.finance_access(p_organization_id,'contract.view'))) order by created_at desc limit 60)d),'[]'::jsonb) else '[]'::jsonb end,
  'events',case when manager then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select actor_id,action,created_at from private.site_events where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 30)d),'[]'::jsonb) else '[]'::jsonb end
 ) into result from public.projects p left join private.site_state s on s.organization_id=p_organization_id and s.project_id=p.id where p.organization_id=p_organization_id and p.id=p_project_id;
 return result;
end$;

create or replace function public.project_site_media_put(p_organization_id uuid,p_project_id uuid,p_category text,p_filename text,p_mime text,p_base64 text,p_caption text default '')
returns uuid language plpgsql security definer set search_path='' as $
declare v_id uuid;v_bytes bytea;v_stage text;begin
 if not private.site_allowed(p_organization_id,p_project_id,array['manager','architect','structural_designer','site_engineer','quality_inspector']) then raise exception 'Media access denied' using errcode='42501';end if;
 if p_category not in ('design','daily','site','inspection','agreement') or p_mime not in ('image/jpeg','image/png','image/webp','video/mp4','application/pdf')
 or length(p_filename) not between 1 and 180 or (position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 or p_filename ~ '[[:cntrl:]]') or length(coalesce(p_caption,''))>500 or length(p_base64)>11500000 then raise exception 'Invalid media' using errcode='22023';end if;
 select stage into v_stage from private.site_state where project_id=p_project_id and organization_id=p_organization_id;
 if p_category='agreement' then
  if v_stage is null or p_mime<>'application/pdf'
    or not private.construction_can_manage(p_organization_id,p_project_id)
    or not private.finance_access(p_organization_id,'contract.manage')
  then raise exception 'Private agreement PDF requires authorized commercial project manager' using errcode='42501';end if;
 else
  if v_stage is null or (v_stage='design' and p_category<>'design') or (v_stage='execution' and p_category='design') or v_stage not in ('design','execution') then raise exception 'Media not permitted in this phase' using errcode='42501';end if;
 end if;
 if p_category='design' and not private.site_allowed(p_organization_id,p_project_id,array['manager','architect','structural_designer']) then raise exception 'Design role required' using errcode='42501';end if;
 if p_category not in ('design','agreement') and not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','quality_inspector']) then raise exception 'Site role required' using errcode='42501';end if;
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
end$;

create or replace function public.project_site_media_get(p_organization_id uuid,p_project_id uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $
declare m private.site_media;role text;begin
 if not private.site_access(p_organization_id,p_project_id) then raise exception 'Media not available' using errcode='42501';end if;
 role=private.site_role(p_organization_id,p_project_id);
 if not private.site_is_manager(p_organization_id,p_project_id) and role not in ('manager','architect','structural_designer','site_engineer','quality_inspector') then raise exception 'Media not available' using errcode='42501';end if;
 select * into m from private.site_media where organization_id=p_organization_id and project_id=p_project_id and id=p_id;
 if m.id is null then raise exception 'Media not found' using errcode='42501';end if;
 if m.category='agreement' and (
    not private.construction_can_manage(p_organization_id,p_project_id)
    or not private.finance_access(p_organization_id,'contract.view')
 ) then raise exception 'Agreement media restricted' using errcode='42501';end if;
 if m.category='design' and role in ('watchman','procurement') and not private.site_is_manager(p_organization_id,p_project_id) then raise exception 'Media not permitted' using errcode='42501';end if;
 if m.category<>'design' and role in ('architect','structural_designer') and not private.site_is_manager(p_organization_id,p_project_id) then raise exception 'Media not permitted' using errcode='42501';end if;
 return jsonb_build_object('filename',m.filename,'mime',m.mime,'base64',encode(m.bytes,'base64'));
end$;

-- Composite foreign keys guard the organization AND the project, not just a
-- globally unique identifier supplied by a client.
create unique index contracts_project_agreement_fk
  on public.contracts(organization_id,project_id,id);
create unique index site_media_project_agreement_fk
  on private.site_media(organization_id,project_id,id);

create table private.project_agreement_events (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 contract_id uuid not null,
 event_kind text not null check(event_kind in ('signed_copy_recorded','owner_exception','revoked')),
 media_id uuid,
 previous_event_id uuid references private.project_agreement_events(id),
 evidence_note text not null default '' check(length(evidence_note)<=3000),
 reference text not null default '' check(length(reference)<=1000),
 scope_fingerprint text not null check(scope_fingerprint ~ '^[a-f0-9]{32}$'),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 check (
   (event_kind='signed_copy_recorded' and media_id is not null and previous_event_id is null)
   or (event_kind='owner_exception' and media_id is null and previous_event_id is null)
   or (event_kind='revoked' and media_id is null and previous_event_id is not null)
 ),
 foreign key(organization_id,project_id,contract_id)
   references public.contracts(organization_id,project_id,id),
 foreign key(organization_id,project_id,media_id)
   references private.site_media(organization_id,project_id,id)
);
create index project_agreement_latest on private.project_agreement_events(
 organization_id,project_id,contract_id,sequence desc);

alter table private.project_agreement_events enable row level security;
alter table private.project_agreement_events force row level security;
revoke all on private.project_agreement_events from public,anon,authenticated;
create trigger agreement_events_immutable_update
 before update or delete on private.project_agreement_events
 for each row execute function private.ops_immutable();

-- Scope changes through the canonical approved change-order flow invalidate
-- the previously recorded clearance until fresh evidence is recorded.
create function private.project_agreement_scope(p_contract_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_object(
   'contract_id',c.id,
   'revision_id',c.revision_id,
   'acceptance_id',c.acceptance_id,
   'accepted_scope',c.source_snapshot,
   'approved_changes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',co.id,'approved_at',co.approved_at,
        'adjustment',co.net_adjustment,'snapshot',co.document_snapshot)
        order by co.approved_at,co.id)
      from public.change_orders co
      where co.organization_id=c.organization_id and co.contract_id=c.id
        and co.status='approved'),'[]'::jsonb)
 )::text)
 from public.contracts c where c.id=p_contract_id;
$$;

-- Fail closed for zero or multiple active contracts. A staged project needs a
-- single unambiguous active commercial agreement and an active payment schedule.
create function private.project_agreement_authorized(p_org uuid,p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
   select count(*)=1 and bool_and(
     exists(select 1 from public.payment_schedules ps
       where ps.organization_id=c.organization_id and ps.contract_id=c.id
         and ps.status='active')
     and exists(select 1
       from private.project_agreement_events e
       where e.organization_id=c.organization_id and e.project_id=c.project_id
         and e.contract_id=c.id
         and e.event_kind in ('signed_copy_recorded','owner_exception')
         and e.scope_fingerprint=private.project_agreement_scope(c.id)
         and e.sequence=(
           select max(recent.sequence) from private.project_agreement_events recent
           where recent.organization_id=c.organization_id
             and recent.project_id=c.project_id and recent.contract_id=c.id
         ))
   )
   from public.contracts c
   where c.organization_id=p_org and c.project_id=p_project
     and c.status='active'
 ),false);
$$;

create function private.project_agreement_require(p_org uuid,p_project uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.project_agreement_authorized(p_org,p_project),false)
 then
  raise exception 'Active contract, approved payment schedule and current signed agreement evidence (or owner-authorized exception) are required before physical execution'
    using errcode='23514';
 end if;
end$$;

-- Guard BOTH legacy physical-work entry points. This is stronger than UI form
-- validation or a single endpoint check: the original RPCs cannot bypass it.
create function private.project_site_agreement_gate()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   if new.stage='execution' then
      perform private.project_agreement_require(new.organization_id,new.project_id);
   end if;
 elsif new.stage='execution' and old.stage is distinct from new.stage then
   perform private.project_agreement_require(new.organization_id,new.project_id);
 end if;
 return new;
end$$;
create trigger project_site_agreement_execution_gate
 before insert or update of stage on private.site_state
 for each row execute function private.project_site_agreement_gate();

create function private.project_ops_agreement_gate()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   if new.status='in_progress' then
      perform private.project_agreement_require(new.organization_id,new.project_id);
   end if;
 elsif new.status='in_progress' and old.status is distinct from new.status then
   perform private.project_agreement_require(new.organization_id,new.project_id);
 end if;
 return new;
end$$;
create trigger project_ops_agreement_execution_gate
 before insert or update of status on public.execution_plans
 for each row execute function private.project_ops_agreement_gate();

create function public.project_agreement_read(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.contracts;latest private.project_agreement_events;active_count integer;
begin
 if not private.construction_can_manage(p_organization_id,p_project_id)
   or not private.finance_access(p_organization_id,'contract.view')
 then raise exception 'Contract workspace unavailable' using errcode='42501';end if;
 select count(*) into active_count from public.contracts
  where organization_id=p_organization_id and project_id=p_project_id and status='active';
 select * into c from public.contracts
  where organization_id=p_organization_id and project_id=p_project_id
  order by (status='active') desc,accepted_at desc,id desc limit 1;
 if c.id is not null then
  select * into latest from private.project_agreement_events
    where organization_id=p_organization_id and project_id=p_project_id
      and contract_id=c.id order by sequence desc limit 1;
 end if;
 return jsonb_build_object(
   'contract_id',c.id,'contract_number',c.contract_number,
   'contract_status',c.status,'contract_value',c.original_contract_value,
   'currency',c.currency,'active_contract_count',active_count,
   'active_schedule',c.id is not null and exists(
       select 1 from public.payment_schedules ps
       where ps.organization_id=p_organization_id and ps.contract_id=c.id
         and ps.status='active'),
   'clearance_event_id',latest.id,'clearance_type',latest.event_kind,
   'clearance_media_id',latest.media_id,'clearance_recorded_at',latest.created_at,
   'current_scope',c.id is not null and latest.scope_fingerprint=
      private.project_agreement_scope(c.id),
   'execution_authorized',private.project_agreement_authorized(p_organization_id,p_project_id),
   'can_authorize_exception',private.site_owner(p_organization_id)
 );
end$$;

create function public.project_agreement_command(
 p_organization_id uuid,p_project_id uuid,p_contract_id uuid,
 p_action text,p_input jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contracts;last_record private.project_agreement_events;
  signed_media uuid;event_id uuid;reason text;reference text;kind text;
begin
 -- Financial privilege AND project-specific management required.
 if not private.construction_can_manage(p_organization_id,p_project_id)
    or not private.finance_access(p_organization_id,'contract.manage')
 then raise exception 'Agreement management unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
   or octet_length(p_input::text)>12000
   or p_action not in ('record_signed_pdf','owner_exception','revoke')
 then raise exception 'Invalid agreement command' using errcode='22023';end if;
 -- Lock canonical project and contract to serialize simultaneous decisions.
 perform 1 from public.projects
   where organization_id=p_organization_id and id=p_project_id and status='active'
   for update;
 if not found then raise exception 'Unavailable project' using errcode='42501';end if;
 select * into c from public.contracts
   where organization_id=p_organization_id and project_id=p_project_id
      and id=p_contract_id for update;
 if c.id is null or c.status not in ('pending','active','on_hold') then
   raise exception 'Current accepted contract required' using errcode='42501';end if;
 select * into last_record from private.project_agreement_events
   where organization_id=p_organization_id and project_id=p_project_id
     and contract_id=c.id order by sequence desc limit 1;
 if p_action='record_signed_pdf' then
   if p_input-array['media_id','note']<>'{}'::jsonb
     or length(trim(coalesce(p_input->>'note',''))) not between 12 and 3000
   then raise exception 'Signed agreement evidence note required' using errcode='22023';end if;
   signed_media=(p_input->>'media_id')::uuid;
   if not exists(select 1 from private.site_media m
     where m.organization_id=p_organization_id and m.project_id=p_project_id
      and m.id=signed_media and m.mime='application/pdf' and m.category='agreement')
   then raise exception 'Uploaded private project agreement PDF required' using errcode='42501';end if;
   kind='signed_copy_recorded';
   reason=p_input->>'note'; reference='Private project PDF';
 elsif p_action='owner_exception' then
   if not private.site_owner(p_organization_id)
   then raise exception 'Only company owner can authorize exception' using errcode='42501';end if;
   if p_input-array['reason','reference']<>'{}'::jsonb or
      length(trim(coalesce(p_input->>'reason',''))) not between 30 and 3000
      or length(trim(coalesce(p_input->>'reference',''))) not between 8 and 1000
   then raise exception 'Documented owner exception reason and reference required' using errcode='22023';end if;
   kind='owner_exception';
   reason=p_input->>'reason';reference=p_input->>'reference';
 else
   if p_input-array['previous_event_id','reason']<>'{}'::jsonb
      or last_record.id is null
      or last_record.event_kind='revoked'
      or last_record.id is distinct from (p_input->>'previous_event_id')::uuid
      or length(trim(coalesce(p_input->>'reason',''))) not between 10 and 3000
   then raise exception 'Stale or invalid agreement revocation' using errcode='40001';end if;
   kind='revoked';
   reason=p_input->>'reason';reference='';
 end if;
 insert into private.project_agreement_events(
  organization_id,project_id,contract_id,event_kind,media_id,
  previous_event_id,evidence_note,reference,scope_fingerprint,created_by
 ) values(p_organization_id,p_project_id,c.id,kind,signed_media,
     case when kind='revoked' then last_record.id end,reason,reference,
     private.project_agreement_scope(c.id),auth.uid()) returning id into event_id;
 perform private.site_log(p_organization_id,p_project_id,'agreement.'||kind,event_id);
 return event_id;
end$$;

revoke all on function private.project_agreement_scope(uuid),
 private.project_agreement_authorized(uuid,uuid),
 private.project_agreement_require(uuid,uuid),
 private.project_site_agreement_gate(),
 private.project_ops_agreement_gate(),
 public.project_agreement_read(uuid,uuid),
 public.project_agreement_command(uuid,uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.project_agreement_read(uuid,uuid),
 public.project_agreement_command(uuid,uuid,uuid,text,jsonb) to authenticated;
commit;
