-- Human-entered project manager decisions and measured material corrections.
-- AI quantity takeoff is intentionally not part of this migration.
begin;

create table private.site_manager_updates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 report_date date not null default current_date,
 health text not null check(health in ('on_track','at_risk','blocked')),
 summary text not null check(length(trim(summary)) between 5 and 5000),
 tomorrow_priorities text not null check(length(trim(tomorrow_priorities)) between 5 and 3000),
 decisions_needed text not null default '' check(length(decisions_needed)<=3000),
 materials_notes text not null default '' check(length(materials_notes)<=3000),
 site_instructions text not null default '' check(length(site_instructions)<=3000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 check(isfinite(report_date)),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index site_manager_updates_recent on private.site_manager_updates(organization_id,project_id,report_date desc,created_at desc);

create table private.site_report_reviews (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 report_id uuid not null references private.site_reports(id),
 decision text not null check(decision in ('approved','changes_requested')),
 note text not null default '' check(length(note)<=3000),
 reviewed_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index site_report_reviews_latest on private.site_report_reviews(organization_id,project_id,report_id,created_at desc,id desc);

create table private.site_material_quantity_revisions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 material_id uuid not null references private.site_material_needs(id),
 old_quantity numeric(16,3) not null,
 new_quantity numeric(16,3) not null check(new_quantity>0),
 reason text not null check(length(trim(reason)) between 5 and 2000),
 updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index site_material_qty_history on private.site_material_quantity_revisions(organization_id,project_id,material_id,created_at desc);

do $$
declare item text;
begin
 foreach item in array array['site_manager_updates','site_report_reviews','site_material_quantity_revisions'] loop
  execute format('alter table private.%I enable row level security',item);
  execute format('alter table private.%I force row level security',item);
  execute format('revoke all on private.%I from public,anon,authenticated',item);
 end loop;
end$$;

create function public.project_site_manager_read(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare role text;manager boolean;begin
 if not private.site_access(p_organization_id,p_project_id) then
   raise exception 'Project not available' using errcode='42501';
 end if;
 role=private.site_role(p_organization_id,p_project_id);
 manager=private.site_is_manager(p_organization_id,p_project_id);
 if not manager and role not in ('site_engineer','quality_inspector','procurement') then
   raise exception 'Management updates not available' using errcode='42501';
 end if;
 return jsonb_build_object(
 'updates',coalesce((
    select jsonb_agg(to_jsonb(z) order by z.report_date desc,z.created_at desc,z.id desc)
    from (select id,report_date,health,summary,tomorrow_priorities,decisions_needed,materials_notes,site_instructions,created_by,created_at
          from private.site_manager_updates
          where organization_id=p_organization_id and project_id=p_project_id
          order by report_date desc,created_at desc,id desc limit 30) z),'[]'::jsonb),
 'reviews',coalesce((
    select jsonb_agg(to_jsonb(z) order by z.created_at desc,z.id desc)
    from (select id,report_id,decision,note,reviewed_by,created_at from private.site_report_reviews
          where organization_id=p_organization_id and project_id=p_project_id
          order by created_at desc,id desc limit 100) z),'[]'::jsonb),
 'quantity_revisions',case when manager then coalesce((
    select jsonb_agg(to_jsonb(z) order by z.created_at desc,z.id desc)
    from (select id,material_id,old_quantity,new_quantity,reason,updated_by,created_at
          from private.site_material_quantity_revisions
          where organization_id=p_organization_id and project_id=p_project_id
          order by created_at desc,id desc limit 50) z),'[]'::jsonb) else '[]'::jsonb end
 );
end$$;

create function public.project_site_manager_command(
 p_organization_id uuid,p_project_id uuid,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_report private.site_reports;v_material private.site_material_needs;v_qty numeric(16,3);
begin
 if not private.site_is_manager(p_organization_id,p_project_id)
    or not exists (select 1 from private.site_state where organization_id=p_organization_id
       and project_id=p_project_id and stage='execution') then
   raise exception 'Active project manager and site execution required' using errcode='42501';
 end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 then
   raise exception 'Invalid manager update' using errcode='22023';
 end if;
 perform 1 from public.projects where organization_id=p_organization_id and id=p_project_id for update;
 if p_action='manager_update' then
   if p_input-array['report_date','health','summary','tomorrow_priorities','decisions_needed','materials_notes','site_instructions']<>'{}'::jsonb
      or p_input->>'health' not in ('on_track','at_risk','blocked')
      or length(trim(coalesce(p_input->>'summary',''))) not between 5 and 5000
      or length(trim(coalesce(p_input->>'tomorrow_priorities',''))) not between 5 and 3000
      or length(coalesce(p_input->>'decisions_needed',''))>3000
      or length(coalesce(p_input->>'materials_notes',''))>3000
      or length(coalesce(p_input->>'site_instructions',''))>3000
      or coalesce((p_input->>'report_date')::date,current_date) not between current_date-7 and current_date+1
   then raise exception 'Invalid project manager update' using errcode='22023';end if;
   insert into private.site_manager_updates(
     organization_id,project_id,report_date,health,summary,tomorrow_priorities,
     decisions_needed,materials_notes,site_instructions,created_by
   ) values (
     p_organization_id,p_project_id,coalesce((p_input->>'report_date')::date,current_date),p_input->>'health',
     trim(p_input->>'summary'),trim(p_input->>'tomorrow_priorities'),
     coalesce(p_input->>'decisions_needed',''),coalesce(p_input->>'materials_notes',''),
     coalesce(p_input->>'site_instructions',''),auth.uid()
   ) returning id into v_id;
   perform private.site_log(p_organization_id,p_project_id,'manager.updated',v_id);
 elsif p_action='report_review' then
   if p_input-array['report_id','decision','note']<>'{}'::jsonb
      or p_input->>'decision' not in ('approved','changes_requested')
      or length(coalesce(p_input->>'note',''))>3000
      or (p_input->>'decision'='changes_requested'
          and length(trim(coalesce(p_input->>'note','')))<5)
   then raise exception 'Invalid report review' using errcode='22023';end if;
   select * into v_report from private.site_reports
   where organization_id=p_organization_id and project_id=p_project_id
     and id=(p_input->>'report_id')::uuid;
   if v_report.id is null or v_report.created_by=auth.uid() then
     raise exception 'An independent manager must review a team member report' using errcode='42501';
   end if;
   if (select decision from private.site_report_reviews
       where organization_id=p_organization_id and project_id=p_project_id
         and report_id=v_report.id order by created_at desc,id desc limit 1)
       =p_input->>'decision' then
     raise exception 'This decision is already recorded' using errcode='23514';
   end if;
   insert into private.site_report_reviews(
      organization_id,project_id,report_id,decision,note,reviewed_by
   ) values(p_organization_id,p_project_id,v_report.id,p_input->>'decision',coalesce(p_input->>'note',''),auth.uid())
     returning id into v_id;
   perform private.site_log(p_organization_id,p_project_id,'daily.'||(p_input->>'decision'),v_id);
 elsif p_action='material_quantity_correct' then
   if p_input-array['id','quantity','reason']<>'{}'::jsonb
      or length(trim(coalesce(p_input->>'reason',''))) not between 5 and 2000 then
     raise exception 'Explain the measured quantity correction' using errcode='22023';
   end if;
   v_qty=(p_input->>'quantity')::numeric(16,3);
   if v_qty is null or v_qty<=0 or v_qty>100000000 then
     raise exception 'Enter a valid positive manual quantity' using errcode='22023';
   end if;
   select * into v_material from private.site_material_needs
     where organization_id=p_organization_id and project_id=p_project_id
       and id=(p_input->>'id')::uuid for update;
   if v_material.id is null or v_material.status not in ('requested','approved')
      or v_material.quantity=v_qty then
     raise exception 'Only un-ordered requests can be changed to a new quantity' using errcode='23514';
   end if;
   update private.site_material_needs set quantity=v_qty,updated_at=now() where id=v_material.id;
   insert into private.site_material_quantity_revisions(
     organization_id,project_id,material_id,old_quantity,new_quantity,reason,updated_by
   ) values (
     p_organization_id,p_project_id,v_material.id,v_material.quantity,v_qty,
     trim(p_input->>'reason'),auth.uid()
   ) returning id into v_id;
   perform private.site_log(p_organization_id,p_project_id,'material.quantity_corrected',v_id);
 else
   raise exception 'Unknown manager action' using errcode='22023';
 end if;
 return jsonb_build_object('id',v_id,'action',p_action);
end$$;

-- Team members with assigned project roles need a safe entry point independent
-- of organization-wide project.view (which could expose other customer jobs).
create function public.project_site_my_projects(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path='' as $
 select coalesce(jsonb_agg(to_jsonb(z) order by z.created_at desc,z.id desc),'[]'::jsonb)
 from (
   select p.id,p.name,p.code,p.created_at,coalesce(s.stage,'not_started') stage,
     coalesce(private.site_role(p_organization_id,p.id),
       case when private.site_is_manager(p_organization_id,p.id) then 'manager' else 'assigned' end) role
   from public.projects p
   left join private.site_state s on s.organization_id=p.organization_id and s.project_id=p.id
   where p.organization_id=p_organization_id and p.status='active'
     and private.site_access(p_organization_id,p.id)
   order by p.created_at desc,p.id desc limit 50
 ) z
$;

revoke all on function public.project_site_manager_read(uuid,uuid),
 public.project_site_manager_command(uuid,uuid,text,jsonb),public.project_site_my_projects(uuid) from public,anon;
grant execute on function public.project_site_manager_read(uuid,uuid),
 public.project_site_manager_command(uuid,uuid,text,jsonb),public.project_site_my_projects(uuid) to authenticated;
commit;
