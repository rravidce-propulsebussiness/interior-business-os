-- Construction OS Phase 4: link canonical Operations inspections to floor stages.
-- Clearance is append-only and never overwrites task percentages or certifications.
begin;

create table private.construction_stage_inspections(
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 inspection_id uuid not null,
 attached_by uuid not null references public.profiles(id),
 attached_at timestamptz not null default now(),
 primary key(organization_id,project_id,inspection_id),
 foreign key(organization_id,project_id,stage_id)
  references private.construction_project_stages(organization_id,project_id,id),
 foreign key(organization_id,project_id,inspection_id)
  references public.project_inspections(organization_id,project_id,id)
);
create index construction_stage_inspections_stage on private.construction_stage_inspections(
 organization_id,project_id,stage_id);

create table private.construction_stage_reviews(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 inspection_id uuid not null,
 review_kind text not null check(review_kind in ('quality','structural')),
 decision text not null check(decision in ('approved','rejected')),
 notes text not null check(length(trim(notes)) between 12 and 2500),
 reviewer_id uuid not null references public.profiles(id),
 reviewed_at timestamptz not null default now(),
 sequence bigint generated always as identity unique,
 unique(organization_id,project_id,id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id),
 foreign key(organization_id,project_id,inspection_id)
   references private.construction_stage_inspections(organization_id,project_id,inspection_id)
);
create index construction_review_latest on private.construction_stage_reviews(
 stage_id,review_kind,sequence desc);

create table private.construction_stage_clearances(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 quality_review_id uuid not null,
 structural_review_id uuid,
 scope_fingerprint text not null check(scope_fingerprint ~ '^[a-f0-9]{32}$'),
 certificate_note text not null check(length(trim(certificate_note)) between 12 and 3000),
 created_by uuid not null references public.profiles(id),
 certified_at timestamptz not null default now(),
 sequence bigint generated always as identity unique,
 unique(organization_id,project_id,id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id),
 foreign key(organization_id,project_id,quality_review_id)
   references private.construction_stage_reviews(organization_id,project_id,id),
 foreign key(organization_id,project_id,structural_review_id)
   references private.construction_stage_reviews(organization_id,project_id,id)
);

do $$
declare table_name text;
begin
 foreach table_name in array array[
  'construction_stage_inspections','construction_stage_reviews','construction_stage_clearances'
 ] loop
   execute format('alter table private.%I enable row level security',table_name);
   execute format('alter table private.%I force row level security',table_name);
   execute format('revoke all on private.%I from public,anon,authenticated',table_name);
 end loop;
end$$;
create trigger immutable_stage_inspections before update or delete on
 private.construction_stage_inspections for each row execute function private.ops_immutable();
create trigger immutable_stage_reviews before update or delete on
 private.construction_stage_reviews for each row execute function private.ops_immutable();
create index construction_stage_clearance_latest on private.construction_stage_clearances(stage_id,sequence desc);
create trigger immutable_stage_clearances before update or delete on
 private.construction_stage_clearances for each row execute function private.ops_immutable();

-- The reviewed inspection must be the most recent terminal member of its
-- failed/reinspect lineage. A passed parent cannot hide a newer failed child.
create function private.construction_inspection_valid(p_inspection uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.project_inspections i
   where i.id=p_inspection and i.status='passed' and i.mandatory
     and i.approved_at is not null
     and not exists(select 1 from public.project_inspections child
       where child.predecessor_id=i.id)
 );
$$;

-- A certificate can cease to be CURRENT if an Operations task is reopened,
-- a new reinspection is filed, the current agreement is revoked, or a newer
-- reviewer decision rejects a stage. The audit record remains unmodified.
create function private.construction_stage_current(p_org uuid,p_project uuid,p_stage uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
  select
   private.project_agreement_authorized(p_org,p_project)
   and c.scope_fingerprint=(
    select private.project_agreement_scope(k.id) from public.contracts k
    where k.organization_id=p_org and k.project_id=p_project and k.status='active'
    limit 1)
   and exists(select 1 from private.construction_stage_tasks st
      where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=s.id)
   and not exists(select 1 from private.construction_stage_tasks st
      join public.project_tasks task on task.id=st.task_id
      where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=s.id and task.status<>'done')
   and exists(select 1 from private.construction_stage_inspections link
      join public.project_inspections i on i.id=link.inspection_id
      where link.stage_id=s.id and link.organization_id=p_org
       and link.project_id=p_project and i.mandatory)
   and not exists(select 1 from private.construction_stage_inspections link
      where link.stage_id=s.id and link.organization_id=p_org
        and link.project_id=p_project
        and not private.construction_inspection_valid(link.inspection_id))
   and exists(select 1 from private.construction_stage_reviews qr
      where qr.id=c.quality_review_id and qr.stage_id=s.id
       and qr.review_kind='quality' and qr.decision='approved'
       and qr.sequence=(select max(qr2.sequence)
         from private.construction_stage_reviews qr2
         where qr2.stage_id=s.id and qr2.review_kind='quality')
       and private.construction_inspection_valid(qr.inspection_id))
   and (
      s.hold_point is distinct from 'structural'
      or (
        c.structural_review_id is not null
        and c.structural_review_id<>c.quality_review_id
        and exists(select 1 from private.construction_stage_reviews sr
            where sr.id=c.structural_review_id and sr.stage_id=s.id
             and sr.review_kind='structural' and sr.decision='approved'
             and sr.reviewer_id<>(select reviewer_id from private.construction_stage_reviews
                where id=c.quality_review_id)
             and sr.sequence=(select max(sr2.sequence)
               from private.construction_stage_reviews sr2
               where sr2.stage_id=s.id and sr2.review_kind='structural')
             and private.construction_inspection_valid(sr.inspection_id))
      )
   )
  from private.construction_project_stages s
  join private.construction_stage_clearances c
   on c.stage_id=s.id and c.project_id=s.project_id
     and c.organization_id=s.organization_id
  where s.organization_id=p_org and s.project_id=p_project and s.id=p_stage
  order by c.sequence desc limit 1
 ),false);
$$;

create function public.construction_quality_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare can_manage boolean;
begin
 if not private.construction_project_access(p_org,p_project)
 then raise exception 'Unavailable construction project' using errcode='42501';end if;
 -- Restricted staff cannot enumerate structural details or inspections.
 can_manage=private.construction_can_manage(p_org,p_project);
 if not can_manage and not exists(
   select 1 from private.construction_project_roles r
   where r.organization_id=p_org and r.project_id=p_project
    and r.user_id=auth.uid() and r.active
    and r.role in ('quality_inspector','structural_engineer'))
 then raise exception 'Stage inspection workspace unavailable' using errcode='42501';end if;
 return jsonb_build_object(
  'available_inspections',case when can_manage then coalesce((
    select jsonb_agg(jsonb_build_object('id',i.id,'number',i.number,
      'status',i.status,'mandatory',i.mandatory,'is_final',i.is_final)
      order by i.created_at desc,i.id desc)
    from public.project_inspections i
    where i.organization_id=p_org and i.project_id=p_project
     and i.mandatory),'[]'::jsonb) else '[]'::jsonb end,
  'stages',coalesce((
   select jsonb_agg(jsonb_build_object(
     'stage_id',s.id,'title',s.title,'instance_code',s.instance_code,
     'hold_point',s.hold_point,'cleared',private.construction_stage_current(p_org,p_project,s.id),
     'inspections',coalesce((
       select jsonb_agg(jsonb_build_object(
         'id',i.id,'number',i.number,'status',i.status,
         'mandatory',i.mandatory,'inspector_id',i.inspector_id,
         'approved_by',i.approved_by,
         'current',private.construction_inspection_valid(i.id))
         order by i.created_at,i.id)
       from private.construction_stage_inspections link
       join public.project_inspections i on i.id=link.inspection_id
       where link.stage_id=s.id and link.organization_id=p_org
         and link.project_id=p_project),'[]'::jsonb),
     'reviews',coalesce((
       select jsonb_agg(jsonb_build_object('id',r.id,'review_kind',r.review_kind,
         'decision',r.decision,'reviewer_id',r.reviewer_id,'notes',r.notes,
         'inspections_id',r.inspection_id,'reviewed_at',r.reviewed_at)
         order by r.sequence desc)
       from private.construction_stage_reviews r
       where r.stage_id=s.id and r.organization_id=p_org
        and r.project_id=p_project),'[]'::jsonb)
     ) order by s.sequence)
   from private.construction_project_stages s
   where s.organization_id=p_org and s.project_id=p_project),'[]'::jsonb));
end$$;

create function public.construction_quality_command(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 stage private.construction_project_stages; inspect public.project_inspections;
 q private.construction_stage_reviews; sr private.construction_stage_reviews;
 actor uuid=auth.uid(); result_id uuid; kind text; decision text; why text;
 reviewer_role text;
begin
 if not private.construction_project_access(p_org,p_project)
 then raise exception 'Unavailable construction project' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or
    octet_length(p_input::text)>12000 or p_action not in (
    'inspection_link','review','stage_clear')
 then raise exception 'Invalid quality operation' using errcode='22023';end if;
 select * into stage from private.construction_project_stages
   where organization_id=p_org and project_id=p_project
     and id=(p_input->>'stage_id')::uuid;
 if stage.id is null then raise exception 'Project stage not found' using errcode='42501';end if;
 -- Serialize records with other commands for this project.
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;

 if p_action='inspection_link' then
    if not private.construction_can_manage(p_org,p_project) or
       p_input-array['stage_id','inspection_id']<>'{}'::jsonb
    then raise exception 'Project manager must attach formal inspection' using errcode='42501';end if;
    select * into inspect from public.project_inspections
     where organization_id=p_org and project_id=p_project
       and id=(p_input->>'inspection_id')::uuid;
    if inspect.id is null or not inspect.mandatory or
       inspect.is_final and stage.phase<>'handover'
    then raise exception 'Active mandatory project inspection required' using errcode='23514';end if;
    insert into private.construction_stage_inspections(
      organization_id,project_id,stage_id,inspection_id,attached_by
    ) values(p_org,p_project,stage.id,inspect.id,actor)
    on conflict(organization_id,project_id,inspection_id) do nothing
    returning inspection_id into result_id;
    if result_id is null then
      if not exists(select 1 from private.construction_stage_inspections
         where organization_id=p_org and project_id=p_project
            and inspection_id=inspect.id and stage_id=stage.id)
      then raise exception 'Inspection already linked to a different stage'
        using errcode='23505';end if;
      result_id=inspect.id;
    end if;

 elsif p_action='review' then
    if p_input-array['stage_id','inspection_id','review_kind','decision','notes']<>'{}'::jsonb
     then raise exception 'Invalid review fields' using errcode='22023';end if;
    kind=p_input->>'review_kind';decision=p_input->>'decision';
    why=trim(coalesce(p_input->>'notes',''));
    if kind not in ('quality','structural') or decision not in ('approved','rejected')
       or length(why) not between 12 and 2500
    then raise exception 'Review kind, decision and evidence note required' using errcode='22023';end if;
    reviewer_role=case when kind='quality' then 'quality_inspector' else 'structural_engineer' end;
    if not exists(select 1 from private.construction_project_roles role
       where role.organization_id=p_org and role.project_id=p_project
       and role.user_id=actor and role.active and role.role=reviewer_role)
    then raise exception 'Independently assigned reviewer role required' using errcode='42501';end if;
    if kind='structural' and stage.hold_point<>'structural'
    then raise exception 'Structural sign-off is only for structural hold points'
      using errcode='22023';end if;
    select i.* into inspect from public.project_inspections i
     join private.construction_stage_inspections link on link.inspection_id=i.id
     where link.organization_id=p_org and link.project_id=p_project
       and link.stage_id=stage.id and i.organization_id=p_org
       and i.project_id=p_project and i.id=(p_input->>'inspection_id')::uuid;
    if inspect.id is null then raise exception 'Attach an existing project inspection'
      using errcode='42501';end if;
    if decision='approved' and not private.construction_inspection_valid(inspect.id)
    then raise exception 'Only latest passed mandatory inspection can be approved'
      using errcode='23514';end if;
    if decision='approved' and exists(
       select 1 from private.construction_stage_tasks st
       join public.project_tasks task on task.id=st.task_id
       where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=stage.id and task.assigned_to=actor)
    then raise exception 'Work performer cannot certify their own stage'
      using errcode='42501';end if;
    insert into private.construction_stage_reviews(
     organization_id,project_id,stage_id,inspection_id,
     review_kind,decision,notes,reviewer_id)
    values(p_org,p_project,stage.id,inspect.id,kind,decision,why,actor)
    returning id into result_id;

 else
    if not private.construction_can_manage(p_org,p_project) or
       p_input-array['stage_id','notes']<>'{}'::jsonb
    then raise exception 'Project manager clearance required' using errcode='42501';end if;
    why=trim(coalesce(p_input->>'notes',''));
    if length(why) not between 12 and 3000
    then raise exception 'Stage certification note required' using errcode='22023';end if;
    perform private.project_agreement_require(p_org,p_project);
    if private.construction_stage_current(p_org,p_project,stage.id)
    then raise exception 'Stage already has a current certified clearance'
      using errcode='23505';end if;
    if not exists(select 1 from public.execution_plans p
       where p.organization_id=p_org and p.project_id=p_project
         and p.status in ('in_progress','punch_list','ready_for_handover'))
    then raise exception 'Operations execution must be active' using errcode='23514';end if;
    if not exists(select 1 from private.construction_stage_tasks st
       where st.organization_id=p_org and st.project_id=p_project
         and st.stage_id=stage.id) or exists(
       select 1 from private.construction_stage_tasks st
       join public.project_tasks task on task.id=st.task_id
       where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=stage.id and task.status<>'done')
    then raise exception 'All stage tasks must be linked and completed in Operations'
       using errcode='23514';end if;
    if not exists(select 1 from private.construction_stage_inspections l
         where l.organization_id=p_org and l.project_id=p_project
           and l.stage_id=stage.id)
       or exists(select 1 from private.construction_stage_inspections l
         where l.organization_id=p_org and l.project_id=p_project
          and l.stage_id=stage.id
          and not private.construction_inspection_valid(l.inspection_id))
    then raise exception 'Every attached mandatory inspection must have a latest pass'
       using errcode='23514';end if;
    -- Check full prerequisite closure, not merely immediate predecessor.
    if exists(
       with recursive closure(predecessor_id) as (
        select predecessor_id from private.construction_stage_dependencies
        where organization_id=p_org and project_id=p_project and stage_id=stage.id
        union
        select d.predecessor_id from private.construction_stage_dependencies d
        join closure c on c.predecessor_id=d.stage_id
        where d.organization_id=p_org and d.project_id=p_project
       )
       select 1 from closure c
       where not private.construction_stage_current(p_org,p_project,c.predecessor_id)
    ) then raise exception 'Stage prerequisites are not currently certified'
       using errcode='23514';end if;
    select * into q from private.construction_stage_reviews r
      where r.organization_id=p_org and r.project_id=p_project
       and r.stage_id=stage.id and r.review_kind='quality'
      order by r.sequence desc limit 1;
    if q.id is null or q.decision<>'approved'
      or not private.construction_inspection_valid(q.inspection_id)
    then raise exception 'Latest independent quality review must approve' using errcode='23514';end if;
    if stage.hold_point='structural' then
      select * into sr from private.construction_stage_reviews r
       where r.organization_id=p_org and r.project_id=p_project
        and r.stage_id=stage.id and r.review_kind='structural'
       order by r.sequence desc limit 1;
      if sr.id is null or sr.decision<>'approved' or sr.reviewer_id=q.reviewer_id
       or not private.construction_inspection_valid(sr.inspection_id)
      then raise exception 'Independent structural engineer must approve' using errcode='23514';end if;
    end if;
    -- A re-certification after new problems must cite fresh independent reviews.
    if exists(select 1 from private.construction_stage_clearances previous
       join private.construction_stage_reviews oldq on oldq.id=previous.quality_review_id
       where previous.organization_id=p_org and previous.project_id=p_project
         and previous.stage_id=stage.id and oldq.sequence>=q.sequence)
    then raise exception 'A new quality review is required to recertify'
       using errcode='23514';end if;
    if stage.hold_point='structural' and exists(
       select 1 from private.construction_stage_clearances previous
       join private.construction_stage_reviews olds on olds.id=previous.structural_review_id
       where previous.organization_id=p_org and previous.project_id=p_project
        and previous.stage_id=stage.id and olds.sequence>=sr.sequence)
    then raise exception 'A new structural review is required to recertify'
       using errcode='23514';end if;
    insert into private.construction_stage_clearances(
     organization_id,project_id,stage_id,quality_review_id,structural_review_id,
     scope_fingerprint,certificate_note,created_by)
    select p_org,p_project,stage.id,q.id,sr.id,
       private.project_agreement_scope(c.id),why,actor
    from public.contracts c where c.organization_id=p_org and c.project_id=p_project
      and c.status='active'
    returning id into result_id;
    if result_id is null then raise exception 'Active contract required' using errcode='23514';end if;
 end if;
 perform private.site_log(p_org,p_project,'construction.quality.'||p_action,result_id);
 return result_id;
end$$;

revoke all on function private.construction_inspection_valid(uuid),
 private.construction_stage_current(uuid,uuid,uuid),
 public.construction_quality_read(uuid,uuid),
 public.construction_quality_command(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.construction_quality_read(uuid,uuid),
 public.construction_quality_command(uuid,uuid,text,jsonb) to authenticated;
commit;
