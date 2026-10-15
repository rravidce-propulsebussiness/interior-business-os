-- Client portal uses existing Supabase Auth, never staff organization membership.
-- Owner grants verified email access to a specific converted customer project.
begin;

create table if not exists private.client_project_access (
 organization_id uuid not null,
 customer_id uuid not null,
 project_id uuid not null,
 email text not null check (email=lower(trim(email)) and length(email) between 5 and 254),
 active boolean not null default true,
 added_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(organization_id,project_id,email),
 foreign key(organization_id,project_id) references public.projects(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index if not exists client_project_access_email_idx
 on private.client_project_access (email, active);
alter table private.client_project_access enable row level security;
alter table private.client_project_access force row level security;
revoke all on private.client_project_access from public,anon,authenticated;

create table if not exists private.client_design_decisions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 customer_id uuid not null,
 user_id uuid not null,
 email text not null,
 decision text not null check(decision in ('approved','changes_requested')),
 design_kind text,
 note text not null default '',
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
alter table private.client_design_decisions enable row level security;
alter table private.client_design_decisions force row level security;
revoke all on private.client_design_decisions from public,anon,authenticated;

create or replace function private.client_portal_verified_email()
returns text language sql stable security definer set search_path='' as $$
 select lower(trim(email)) from auth.users
 where id=(select auth.uid()) and email_confirmed_at is not null
 and email is not null
$$;

create or replace function private.client_portal_accessible(p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
   select 1 from private.client_project_access a
   join public.projects p on p.id=a.project_id and p.organization_id=a.organization_id
   join public.customers c on c.id=a.customer_id and c.organization_id=a.organization_id
   where a.project_id=p_project and a.active
     and a.email=private.client_portal_verified_email()
     and p.customer_id=a.customer_id and p.status='active'
     and not p.is_sales_prospect and c.status='active'
     and not c.is_sales_prospect
 )
$$;

create or replace function public.client_portal_manage(
 p_organization_id uuid,p_customer_id uuid,p_project_id uuid,
 p_email text,p_active boolean default true
) returns void language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
 if (select auth.uid()) is null or
    not private.commercial_access(p_organization_id,'customer.manage','customers')
 then raise exception 'Client access management denied' using errcode='42501'; end if;
 v_email=lower(trim(coalesce(p_email,'')));
 if length(v_email) not between 5 and 254 or
    v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
 then raise exception 'Enter a valid client email address' using errcode='22023';end if;
 if not exists (
   select 1 from public.projects p join public.customers c
    on c.organization_id=p.organization_id and c.id=p.customer_id
   where p.organization_id=p_organization_id and p.id=p_project_id
     and p.customer_id=p_customer_id and p.status='active'
     and c.status='active' and not p.is_sales_prospect
     and not c.is_sales_prospect
 ) then raise exception 'Choose an active converted client project' using errcode='42501';end if;
 insert into private.client_project_access
  (organization_id,customer_id,project_id,email,active,added_by)
 values(p_organization_id,p_customer_id,p_project_id,v_email,p_active,auth.uid())
 on conflict(organization_id,project_id,email)
 do update set active=excluded.active,updated_at=now(),added_by=excluded.added_by;
end; $$;

create or replace function public.client_portal_access_list(
 p_organization_id uuid,p_customer_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null or
 not private.commercial_access(p_organization_id,'customer.view','customers')
 then raise exception 'Client access unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'project_id',a.project_id,'project_name',p.name,
  'email',a.email,'active',a.active,'created_at',a.created_at
 ) order by p.name,a.email),'[]'::jsonb)
 into result
 from private.client_project_access a
 join public.projects p on p.id=a.project_id and p.organization_id=a.organization_id
 where a.organization_id=p_organization_id and a.customer_id=p_customer_id;
 return result;
end; $$;

create or replace function public.client_portal_projects()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if private.client_portal_verified_email() is null then
  raise exception 'Verified client sign-in required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'code',p.code,
   'company_name',o.name,'stage',coalesce(s.stage,'not_started')
 ) order by p.name,p.id),'[]'::jsonb)
 into result from private.client_project_access a
 join public.projects p on p.organization_id=a.organization_id and p.id=a.project_id
 join public.customers c on c.organization_id=a.organization_id and c.id=a.customer_id
 join public.organizations o on o.id=p.organization_id
 left join private.site_state s on s.organization_id=p.organization_id and s.project_id=p.id
 where a.active and a.email=private.client_portal_verified_email()
  and p.customer_id=a.customer_id and p.status='active'
  and c.status='active' and not p.is_sales_prospect and not c.is_sales_prospect;
 return result;
end; $$;

create or replace function public.client_portal_project(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.client_portal_accessible(p_project_id)
 then raise exception 'This project is not shared with your account' using errcode='42501';end if;
 select jsonb_build_object(
  'id',p.id,'name',p.name,'code',p.code,'company_name',o.name,
  'stage',coalesce(s.stage,'not_started'),
  'client_approved_at',s.client_approval_recorded_at,
  'reports',coalesce((
    select jsonb_agg(to_jsonb(r) order by r.report_date desc,r.created_at desc)
    from (
      select report_date,completed_work,tomorrow_plan,worker_count,tomorrow_workers,created_at
      from private.site_reports
      where organization_id=p.organization_id and project_id=p.id
      order by report_date desc,created_at desc limit 35
    ) r
  ),'[]'::jsonb),
  'drawings',coalesce((
    select jsonb_agg(to_jsonb(d) order by d.created_at desc)
    from (
      select kind,revision,reference,status,created_at
      from private.site_designs
      where organization_id=p.organization_id and project_id=p.id
      order by created_at desc limit 30
    ) d
  ),'[]'::jsonb),
  'photos',coalesce((
    select jsonb_agg(to_jsonb(m) order by m.created_at desc)
    from (
      select id,filename,mime,category,caption,created_at
      from private.site_media
      where organization_id=p.organization_id and project_id=p.id
        and category in ('site','daily','curing','design')
        and mime in ('image/jpeg','image/png','image/webp','application/pdf')
      order by created_at desc limit 60
    ) m
  ),'[]'::jsonb)
 ) into result
 from public.projects p
 join public.organizations o on o.id=p.organization_id
 left join private.site_state s on s.project_id=p.id and s.organization_id=p.organization_id
 where p.id=p_project_id;
 return result;
end; $$;

create or replace function public.client_portal_media_get(p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m private.site_media;
begin
 select * into m from private.site_media
 where id=p_media_id and category in ('site','daily','curing','design')
 and mime in('image/jpeg','image/png','image/webp','application/pdf');
 if m.id is null or not private.client_portal_accessible(m.project_id) then
   raise exception 'File not available' using errcode='42501';end if;
 return jsonb_build_object('mime',m.mime,'filename',m.filename,
   'base64',encode(m.bytes,'base64'));
end; $$;

create or replace function public.client_portal_design_decide(
 p_project_id uuid,p_decision text,p_kind text default null,p_note text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_customer uuid;v_email text;v_kind text;v_current private.site_designs;
begin
 if not private.client_portal_accessible(p_project_id) then
  raise exception 'Client project access required' using errcode='42501';end if;
 select organization_id,customer_id into v_org,v_customer from public.projects where id=p_project_id for update;
 v_email=private.client_portal_verified_email();
 if not exists (select 1 from private.site_state
  where project_id=p_project_id and organization_id=v_org and stage='design')
 then raise exception 'Project is not awaiting design approval' using errcode='23514';end if;
 if p_decision not in ('approved','changes_requested') then
  raise exception 'Invalid design decision' using errcode='22023';end if;
 if p_decision='changes_requested' then
  v_kind=coalesce(p_kind,'');
  if v_kind not in ('architectural_plan','3d_design','structural_design',
    'interior_layout','electrical_plan','plumbing_plan') then
   raise exception 'Choose a drawing' using errcode='22023';end if;
  if length(trim(coalesce(p_note,''))) not between 10 and 1000 then
   raise exception 'Describe the requested changes' using errcode='22023';end if;
  select * into v_current from private.site_designs
  where organization_id=v_org and project_id=p_project_id and kind=v_kind
  order by revision desc limit 1 for update;
  if v_current.id is null or v_current.status<>'approved' then
    raise exception 'A technically reviewed drawing is required' using errcode='23514';end if;
  update private.site_designs set status='changes_requested',
   review_note=trim(p_note),reviewed_at=now()
   where id=v_current.id;
  update private.site_state set client_approval_recorded_at=null,
    client_approval_recorded_by=null,updated_at=now() where project_id=p_project_id;
 else
  if exists(
    select 1 from unnest(case when exists(
      select 1 from public.projects p join public.industries i on i.id=p.industry_id
      where p.id=p_project_id and i.key='interior'
    ) then array['interior_layout','3d_design']::text[]
      else array['architectural_plan','3d_design','structural_design']::text[] end
    ) needed(kind)
    left join lateral(
      select status from private.site_designs d
      where d.organization_id=v_org and d.project_id=p_project_id
      and d.kind=needed.kind order by d.revision desc limit 1
    ) latest on true
    where latest.status is distinct from 'approved'
  ) then raise exception 'Required drawings still need technical review' using errcode='23514';end if;
  update private.site_state set stage='client_approved',
     approval_evidence='Client confirmed latest designs in verified portal: '||v_email,
     client_approval_recorded_at=now(),client_approval_recorded_by=null,
     updated_at=now()
    where organization_id=v_org and project_id=p_project_id and stage='design';
 end if;
 insert into private.client_design_decisions
   (organization_id,project_id,customer_id,user_id,email,decision,design_kind,note)
 values(v_org,p_project_id,v_customer,auth.uid(),v_email,p_decision,
   case when p_decision='changes_requested' then v_kind else null end,left(coalesce(p_note,''),1000));
end; $$;

revoke all on function public.client_portal_manage(uuid,uuid,uuid,text,boolean) from public,anon;
revoke all on function public.client_portal_access_list(uuid,uuid) from public,anon;
revoke all on function public.client_portal_projects() from public,anon;
revoke all on function public.client_portal_project(uuid) from public,anon;
revoke all on function public.client_portal_media_get(uuid) from public,anon;
revoke all on function public.client_portal_design_decide(uuid,text,text,text) from public,anon;
grant execute on function public.client_portal_manage(uuid,uuid,uuid,text,boolean),
 public.client_portal_access_list(uuid,uuid),
 public.client_portal_projects(),public.client_portal_project(uuid),
 public.client_portal_media_get(uuid),
 public.client_portal_design_decide(uuid,text,text,text)
 to authenticated;
commit;
