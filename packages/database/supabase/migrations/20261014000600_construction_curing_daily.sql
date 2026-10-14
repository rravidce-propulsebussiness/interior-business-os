-- Construction OS Phase 5: concrete curing ledger + floor-stage daily report links.
-- Canonical Site Delivery reports, Operations tasks and finance records unchanged.
begin;

create table private.construction_curing_plans(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 pour_reference text not null check(length(trim(pour_reference)) between 3 and 140),
 pour_date date not null check(isfinite(pour_date)),
 minimum_days integer not null check(minimum_days between 1 and 60),
 method text not null check(method in ('ponding','sprinkling','wet_covering','membrane','other')),
 notes text not null check(length(trim(notes)) between 12 and 3000),
 authorized_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,project_id,stage_id,pour_reference),
 unique(organization_id,project_id,id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id)
);
create table private.construction_curing_observations(
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 plan_id uuid not null,
 observed_on date not null check(isfinite(observed_on)),
 result text not null check(result in ('wet','insufficient')),
 note text not null check(length(trim(note)) between 12 and 3000),
 observed_by uuid not null references public.profiles(id),
 observed_at timestamptz not null default now(),
 unique(organization_id,project_id,id),
 foreign key(organization_id,project_id,plan_id)
   references private.construction_curing_plans(organization_id,project_id,id)
);
create index construction_curing_observations_recent on private.construction_curing_observations(
 plan_id,observed_on,sequence desc);
create table private.construction_curing_verifications(
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 observation_id uuid not null,
 decision text not null check(decision in ('verified','rejected')),
 reason text not null check(length(trim(reason)) between 12 and 2500),
 verified_by uuid not null references public.profiles(id),
 verified_at timestamptz not null default now(),
 unique(organization_id,project_id,id),
 foreign key(organization_id,project_id,observation_id)
   references private.construction_curing_observations(organization_id,project_id,id)
);
create index construction_curing_verifications_recent on private.construction_curing_verifications(observation_id,sequence desc);

create table private.construction_stage_report_links(
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 report_id uuid not null,
 linked_by uuid not null references public.profiles(id),
 linked_at timestamptz not null default now(),
 primary key(organization_id,project_id,stage_id,report_id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id),
 foreign key(organization_id,project_id)
   references public.projects(organization_id,id)
);
create index construction_reports_by_report on private.construction_stage_report_links(
 organization_id,project_id,report_id);

do $$
declare tbl text;
begin
 foreach tbl in array array[
 'construction_curing_plans','construction_curing_observations',
 'construction_curing_verifications','construction_stage_report_links'
 ] loop
   execute format('alter table private.%I enable row level security',tbl);
   execute format('alter table private.%I force row level security',tbl);
   execute format('revoke all on private.%I from public,anon,authenticated',tbl);
   execute format('create trigger construction_immutable before update or delete on private.%I for each row execute function private.ops_immutable()',tbl);
 end loop;
end$$;

-- Reuse existing immutable Site Delivery report IDs, scoped to the same tenant/project.
create function private.construction_report_link_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.site_reports report
   where report.organization_id=new.organization_id
     and report.project_id=new.project_id and report.id=new.report_id)
 then raise exception 'Report must belong to the same construction project'
    using errcode='42501';end if;
 return new;
end$$;
create trigger construction_report_project_guard before insert on
 private.construction_stage_report_links for each row
 execute function private.construction_report_link_guard();

-- For mandatory concrete phases, ALL recorded pours must finish their required
-- calendar-day window. Every day must have a latest wet observation independently
-- verified by a site engineer/manager. No arbitrary hard-coded "7 days" default.
create function private.construction_curing_ready(p_org uuid,p_project uuid,p_stage uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
  select case
   when s.phase not in ('foundation','plinth','superstructure') then true
   else exists(select 1 from private.construction_curing_plans plan
       where plan.organization_id=p_org and plan.project_id=p_project
        and plan.stage_id=s.id)
    and not exists(
      select 1 from private.construction_curing_plans plan
      where plan.organization_id=p_org and plan.project_id=p_project
        and plan.stage_id=s.id
        and (
          current_date < plan.pour_date + plan.minimum_days
          or exists(
            select 1 from generate_series(
               plan.pour_date,
               plan.pour_date + plan.minimum_days - 1,
               interval '1 day'
            ) as required(day)
            where not exists (
               select 1 from private.construction_curing_observations ob
               where ob.organization_id=p_org and ob.project_id=p_project
                 and ob.plan_id=plan.id
                 and ob.observed_on=required.day::date
                 and ob.result='wet'
                 and ob.sequence=(
                  select max(newest.sequence)
                  from private.construction_curing_observations newest
                  where newest.plan_id=plan.id and newest.observed_on=required.day::date)
                 and exists(
                   select 1 from private.construction_curing_verifications verify
                   where verify.observation_id=ob.id and verify.decision='verified'
                      and verify.sequence=(
                        select max(later.sequence)
                        from private.construction_curing_verifications later
                        where later.observation_id=ob.id)
                 )
            )
          )
        )
    )
  end
  from private.construction_project_stages s
  where s.organization_id=p_org and s.project_id=p_project and s.id=p_stage
 ),false);
$$;

-- Make current stage certification react to missing or newly rejected curing.
create or replace function private.construction_stage_current(p_org uuid,p_project uuid,p_stage uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
  select
   private.project_agreement_authorized(p_org,p_project)
   and private.construction_curing_ready(p_org,p_project,p_stage)
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

-- Guard the actual INSERT of a certificate, not just a web form button.
create function private.construction_curing_clearance_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.construction_curing_ready(new.organization_id,new.project_id,new.stage_id)
 then raise exception 'Concrete stage curing records are incomplete or unverified'
     using errcode='23514';end if;
 return new;
end$$;
create trigger construction_curing_clearance_gate
before insert on private.construction_stage_clearances for each row
execute function private.construction_curing_clearance_guard();

create function public.construction_field_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean; field_member boolean; allowed boolean;
begin
 if not private.construction_project_access(p_org,p_project)
 then raise exception 'Unavailable project' using errcode='42501';end if;
 manager=private.construction_can_manage(p_org,p_project);
 field_member=exists(select 1 from private.construction_project_roles role
    where role.organization_id=p_org and role.project_id=p_project
     and role.user_id=auth.uid() and role.active
     and role.role in ('site_engineer','supervisor','watchman'))
   or private.site_role(p_org,p_project) in ('site_engineer','watchman');
 allowed=manager or coalesce(field_member,false);
 if not allowed then raise exception 'Site field workspace unavailable' using errcode='42501';end if;
 return jsonb_build_object(
  'can_manage',manager,
  'can_verify',manager or exists(
    select 1 from private.construction_project_roles role
    where role.organization_id=p_org and role.project_id=p_project
      and role.user_id=auth.uid() and role.active and role.role='site_engineer'
  ) or private.site_role(p_org,p_project)='site_engineer',
  'plans',coalesce((select jsonb_agg(jsonb_build_object(
    'id',plan.id,'stage_id',plan.stage_id,'pour_reference',plan.pour_reference,
    'pour_date',plan.pour_date,'minimum_days',plan.minimum_days,'method',plan.method,
    'notes',plan.notes,'required_until',plan.pour_date+plan.minimum_days,
    'ready',private.construction_curing_ready(p_org,p_project,plan.stage_id),
    'observations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ob.id,'date',ob.observed_on,'result',ob.result,'note',ob.note,
        'observed_by',ob.observed_by,
        'verified',coalesce((
          select (v.decision='verified') from private.construction_curing_verifications v
          where v.observation_id=ob.id order by v.sequence desc limit 1),false)
      ) order by ob.observed_on desc,ob.sequence desc)
      from private.construction_curing_observations ob
      where ob.plan_id=plan.id and ob.organization_id=p_org
        and ob.project_id=p_project),'[]'::jsonb)
    ) order by plan.created_at desc,plan.id desc)
    from private.construction_curing_plans plan
    where plan.organization_id=p_org and plan.project_id=p_project),'[]'::jsonb),
  'stage_reports',case when not manager and not exists(
     select 1 from private.construction_project_roles role
      where role.organization_id=p_org and role.project_id=p_project
        and role.user_id=auth.uid() and role.active
        and role.role in ('site_engineer','supervisor'))
      and private.site_role(p_org,p_project) is distinct from 'site_engineer'
    then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage_id',link.stage_id,'report_id',report.id,'report_date',report.report_date,
        'completed_work',report.completed_work,'tomorrow_plan',report.tomorrow_plan,
        'blockers',report.blockers,'worker_count',report.worker_count,
        'created_by',report.created_by) order by report.report_date desc,report.created_at desc)
      from private.construction_stage_report_links link
      join private.site_reports report on report.id=link.report_id
      where link.organization_id=p_org and link.project_id=p_project),'[]'::jsonb) end
 );
end$$;

create function public.construction_field_command(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor uuid=auth.uid(); manager boolean; engineer boolean; observer boolean;
 stage private.construction_project_stages; plan private.construction_curing_plans;
 observation private.construction_curing_observations; result_id uuid; note text;
begin
 if not private.construction_project_access(p_org,p_project)
 then raise exception 'Unavailable project' using errcode='42501';end if;
 if p_action not in ('curing_plan','curing_observe','curing_verify','report_link') or
   jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>14000
 then raise exception 'Unknown construction field command' using errcode='22023';end if;
 manager=private.construction_can_manage(p_org,p_project);
 engineer=exists(select 1 from private.construction_project_roles role
    where role.organization_id=p_org and role.project_id=p_project and role.user_id=actor
      and role.active and role.role='site_engineer')
    or private.site_role(p_org,p_project)='site_engineer';
 observer=coalesce(manager or engineer or exists(
    select 1 from private.construction_project_roles role
    where role.organization_id=p_org and role.project_id=p_project and role.user_id=actor
      and role.active and role.role in ('watchman','supervisor')
  ) or private.site_role(p_org,p_project)='watchman',false);
 if not observer then raise exception 'Assigned field team required' using errcode='42501';end if;
 perform 1 from public.projects
    where organization_id=p_org and id=p_project and status='active' for update;
 if not found then raise exception 'Project not active' using errcode='42501';end if;
 if not private.project_agreement_authorized(p_org,p_project) or
    not (
      exists(select 1 from private.site_state site
       where site.organization_id=p_org and site.project_id=p_project
         and site.stage in ('execution','handover'))
      or exists(select 1 from public.execution_plans ep
        where ep.organization_id=p_org and ep.project_id=p_project
          and ep.status in ('in_progress','punch_list','ready_for_handover'))
    )
 then raise exception 'Site work is not contractually active' using errcode='23514';end if;
 if p_action='curing_plan' or p_action='report_link' then
    if not manager then raise exception 'Project manager required' using errcode='42501';end if;
    select * into stage from private.construction_project_stages
      where organization_id=p_org and project_id=p_project and id=(p_input->>'stage_id')::uuid;
    if stage.id is null then raise exception 'Stage unavailable' using errcode='42501';end if;
 end if;

 if p_action='curing_plan' then
   if p_input-array['stage_id','pour_reference','pour_date','minimum_days','method','notes']<>'{}'::jsonb
     or stage.phase not in ('foundation','plinth','superstructure','masonry','finishes')
   then raise exception 'Invalid concrete curing plan' using errcode='22023';end if;
   note=trim(coalesce(p_input->>'notes',''));
   if length(note) not between 12 and 3000 or
      (p_input->>'pour_date')::date not between current_date-30 and current_date+7
   then raise exception 'Pour date and supporting notes required' using errcode='22023';end if;
   insert into private.construction_curing_plans(
    organization_id,project_id,stage_id,pour_reference,pour_date,minimum_days,method,notes,authorized_by
   ) values (p_org,p_project,stage.id,trim(p_input->>'pour_reference'),
     (p_input->>'pour_date')::date,(p_input->>'minimum_days')::int,
     p_input->>'method',note,actor) returning id into result_id;
 elsif p_action='curing_observe' then
   if p_input-array['plan_id','observed_on','result','note']<>'{}'::jsonb
   then raise exception 'Invalid curing observation' using errcode='22023';end if;
   select * into plan from private.construction_curing_plans
     where organization_id=p_org and project_id=p_project
       and id=(p_input->>'plan_id')::uuid;
   if plan.id is null then raise exception 'Curing plan unavailable' using errcode='42501';end if;
   if (p_input->>'observed_on')::date not between plan.pour_date and
        least(current_date,plan.pour_date+plan.minimum_days-1)
      or (p_input->>'observed_on')::date<current_date-7
   then raise exception 'Curing round date out of permitted window' using errcode='22023';end if;
   note=trim(coalesce(p_input->>'note',''));
   insert into private.construction_curing_observations(
    organization_id,project_id,plan_id,observed_on,result,note,observed_by)
   values (p_org,p_project,plan.id,(p_input->>'observed_on')::date,
     p_input->>'result',note,actor) returning id into result_id;
 elsif p_action='curing_verify' then
   if not (manager or engineer) or
     p_input-array['observation_id','decision','reason']<>'{}'::jsonb
   then raise exception 'Engineer verification required' using errcode='42501';end if;
   select ob.* into observation from private.construction_curing_observations ob
    join private.construction_curing_plans cp on cp.id=ob.plan_id
    where ob.organization_id=p_org and ob.project_id=p_project
      and ob.id=(p_input->>'observation_id')::uuid for update of ob;
   if observation.id is null or observation.observed_by=actor
   then raise exception 'Independent observation verifier required' using errcode='42501';end if;
   note=trim(coalesce(p_input->>'reason',''));
   insert into private.construction_curing_verifications(
      organization_id,project_id,observation_id,decision,reason,verified_by
   ) values (p_org,p_project,observation.id,p_input->>'decision',note,actor)
   returning id into result_id;
 else
   if p_input-array['stage_id','report_id']<>'{}'::jsonb
   then raise exception 'Invalid stage report link' using errcode='22023';end if;
   insert into private.construction_stage_report_links(
     organization_id,project_id,stage_id,report_id,linked_by
   ) values(p_org,p_project,stage.id,(p_input->>'report_id')::uuid,actor)
   on conflict do nothing;
   result_id=(p_input->>'report_id')::uuid;
 end if;
 perform private.site_log(p_org,p_project,'construction.field.'||p_action,result_id);
 return result_id;
end$$;

revoke all on function private.construction_curing_ready(uuid,uuid,uuid),
 private.construction_report_link_guard(),
 private.construction_curing_clearance_guard(),
 public.construction_field_read(uuid,uuid),
 public.construction_field_command(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.construction_field_read(uuid,uuid),
 public.construction_field_command(uuid,uuid,text,jsonb) to authenticated;
commit;
