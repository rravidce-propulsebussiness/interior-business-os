-- Phase 12: identity-verified, project-specific homeowner access.
-- The existing bearer progress route remains read-only and unchanged.
-- A homeowner is NOT an employee and gains NO organization membership.
begin;

create table private.construction_client_project_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  customer_id uuid not null,
  user_id uuid not null references auth.users(id),
  active boolean not null default true,
  version integer not null default 1 check(version>0),
  authorized_by uuid not null references public.profiles(id),
  authorized_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique(organization_id,project_id,user_id),
  unique(organization_id,project_id,id),
  foreign key(organization_id,project_id,customer_id)
    references public.projects(organization_id,id,customer_id),
  foreign key(organization_id,customer_id)
    references public.customers(organization_id,id)
);
create index construction_client_access_user on
  private.construction_client_project_access(user_id,active,organization_id,project_id);

create table private.construction_client_access_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  project_id uuid not null,
  access_id uuid not null,
  action text not null check(action in ('grant','revoke')),
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default clock_timestamp(),
  foreign key(organization_id,project_id,access_id)
    references private.construction_client_project_access(organization_id,project_id,id)
);
alter table private.construction_client_project_access enable row level security;
alter table private.construction_client_project_access force row level security;
alter table private.construction_client_access_events enable row level security;
alter table private.construction_client_access_events force row level security;
revoke all on private.construction_client_project_access,
  private.construction_client_access_events from public,anon,authenticated;
create trigger construction_client_access_history_immutable
  before update or delete on private.construction_client_access_events
  for each row execute function private.ops_immutable();

-- A client must be explicitly assigned, have a confirmed current email
-- matching the canonical customer or PRIMARY contact, and be an active user.
-- Re-check on EVERY read, so a changed contact/email or revoked assignment
-- removes access without relying on stale cookies or UI state.
create function private.construction_client_user_allowed(p_org uuid,p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select exists(
   select 1 from private.construction_client_project_access a
   join public.projects p on p.organization_id=a.organization_id
     and p.id=a.project_id and p.customer_id=a.customer_id
   join public.customers c on c.organization_id=p.organization_id
     and c.id=p.customer_id and c.status='active'
   join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null
   join public.profiles profile on profile.id=u.id and profile.status='active'
   where a.organization_id=p_org and a.project_id=p_project
     and a.user_id=(select auth.uid()) and a.active
     and p.status='active'
     and (
       lower(trim(c.email))=lower(trim(u.email))
       or exists(select 1 from public.customer_contacts contact
          where contact.organization_id=p_org and contact.customer_id=c.id
            and contact.is_primary
            and lower(trim(contact.email))=lower(trim(u.email)))
     )
   )),false)
   and private.entitled(p_org,'projects');
$$;

create function public.construction_client_access_manage(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_email text;v_user uuid;v_customer uuid;v_access private.construction_client_project_access;
begin
 if not private.construction_can_manage(p_org,p_project) then
   raise exception 'Project manager required' using errcode='42501';end if;
 if p_action not in ('grant','revoke') or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>1000 then
   raise exception 'Invalid client access command' using errcode='22023';end if;
 select p.customer_id into v_customer from public.projects p
 where p.organization_id=p_org and p.id=p_project and p.status='active'
 for update;
 if v_customer is null then raise exception 'Active project required' using errcode='42501';end if;
 if p_action='grant' then
   if p_input-array['email']<>'{}'::jsonb then
      raise exception 'Only verified client email is accepted' using errcode='22023';end if;
   v_email=lower(trim(coalesce(p_input->>'email','')));
   if length(v_email) not between 5 and 254 or v_email !~ '^[^@ ]+@[^@ ]+[.][^@ ]+$'
   then raise exception 'Valid client email required' using errcode='22023';end if;
   if not exists(
     select 1 from public.customers c
     where c.organization_id=p_org and c.id=v_customer and c.status='active'
       and (lower(trim(c.email))=v_email or exists(
         select 1 from public.customer_contacts contact
         where contact.organization_id=p_org and contact.customer_id=c.id
           and contact.is_primary and lower(trim(contact.email))=v_email))
   ) then raise exception 'Email must match the client or primary CRM contact'
     using errcode='42501';end if;
   select u.id into v_user from auth.users u
     join public.profiles profile on profile.id=u.id and profile.status='active'
     where lower(trim(u.email))=v_email and u.email_confirmed_at is not null
     limit 1;
   if v_user is null then
     raise exception 'Client must register and verify this email before access can be granted'
       using errcode='23514';end if;
   insert into private.construction_client_project_access(
      organization_id,project_id,customer_id,user_id,authorized_by,updated_by)
   values(p_org,p_project,v_customer,v_user,auth.uid(),auth.uid())
   on conflict(organization_id,project_id,user_id)
   do update set active=true,version=
      case when private.construction_client_project_access.active then
        private.construction_client_project_access.version
      else private.construction_client_project_access.version+1 end,
      updated_at=case when private.construction_client_project_access.active
        then private.construction_client_project_access.updated_at else clock_timestamp() end,
      updated_by=case when private.construction_client_project_access.active
        then private.construction_client_project_access.updated_by else auth.uid() end
   returning * into v_access;
   if not exists(select 1 from private.construction_client_access_events e
     where e.organization_id=p_org and e.project_id=p_project
       and e.access_id=v_access.id and e.action='grant'
       and not exists(select 1 from private.construction_client_access_events later
         where later.access_id=e.access_id and later.id>e.id))
   then
     insert into private.construction_client_access_events(
       organization_id,project_id,access_id,action,changed_by)
     values(p_org,p_project,v_access.id,'grant',auth.uid());
     perform private.site_log(p_org,p_project,'construction.client.access_granted',v_access.id);
   end if;
 else
   if p_input-array['access_id','version']<>'{}'::jsonb then
      raise exception 'Invalid revocation fields' using errcode='22023';end if;
   select * into v_access from private.construction_client_project_access a
   where a.organization_id=p_org and a.project_id=p_project
     and a.id=(p_input->>'access_id')::uuid for update;
   if v_access.id is null or not v_access.active
      or v_access.version is distinct from (p_input->>'version')::integer
   then raise exception 'Client access missing or stale' using errcode='40001';end if;
   update private.construction_client_project_access
   set active=false,version=version+1,updated_by=auth.uid(),
      updated_at=clock_timestamp()
   where id=v_access.id returning * into v_access;
   insert into private.construction_client_access_events(
     organization_id,project_id,access_id,action,changed_by)
   values(p_org,p_project,v_access.id,'revoke',auth.uid());
   perform private.site_log(p_org,p_project,'construction.client.access_revoked',v_access.id);
 end if;
 return jsonb_build_object('access_id',v_access.id,'active',v_access.active,
                           'version',v_access.version);
end$$;

create function public.construction_client_access_manage_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.construction_can_manage(p_org,p_project)
 then raise exception 'Project manager required' using errcode='42501';end if;
 return jsonb_build_object('members',coalesce((
  select jsonb_agg(jsonb_build_object(
    'id',a.id,'email',u.email,'active',a.active,'version',a.version)
    order by a.active desc,a.updated_at desc,a.id)
  from private.construction_client_project_access a
  join auth.users u on u.id=a.user_id
  where a.organization_id=p_org and a.project_id=p_project),'[]'::jsonb));
end$$;

-- Homepage for logged-in customers, no employee membership/cookie required.
create function public.construction_client_projects()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return jsonb_build_object('projects',coalesce((
   select jsonb_agg(jsonb_build_object(
     'organization_id',p.organization_id,'project_id',p.id,
     'name',p.name,'code',p.code,'company',o.name)
     order by p.name,p.id)
   from public.projects p
   join public.organizations o on o.id=p.organization_id
   join private.construction_client_project_access a
     on a.organization_id=p.organization_id and a.project_id=p.id
   where a.user_id=auth.uid() and a.active and
     private.construction_client_user_allowed(p.organization_id,p.id)
   ),'[]'::jsonb));
end$$;

-- Client can only view the same explicitly published, manager-approved
-- progress that appears in the revocable sharing projection. NEVER join
-- invoices, agreements, site gate/security records, procurement or costs.
create function public.construction_client_project_view(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.construction_client_user_allowed(p_org,p_project)
 then raise exception 'Project unavailable' using errcode='42501';end if;
 return jsonb_build_object(
 'project',(select jsonb_build_object('name',p.name,'code',p.code,
     'company',o.name) from public.projects p
     join public.organizations o on o.id=p.organization_id
     where p.organization_id=p_org and p.id=p_project),
 'stages',coalesce((select jsonb_agg(jsonb_build_object(
     'title',s.title,'floor',s.floor_code,'phase',s.phase,
     'certified',private.construction_stage_current(p_org,p_project,s.id))
     order by s.sequence) from private.construction_project_stages s
     where s.organization_id=p_org and s.project_id=p_project),'[]'::jsonb),
 'updates',coalesce((select jsonb_agg(jsonb_build_object(
      'date',r.report_date,'completed',r.completed_work,
      'tomorrow',r.tomorrow_plan)
      order by r.report_date desc,r.created_at desc,r.id desc)
   from private.site_reports r
   where r.organization_id=p_org and r.project_id=p_project
     and r.id in (select recent.id from private.site_reports recent
       where recent.organization_id=p_org and recent.project_id=p_project
       order by recent.report_date desc,recent.created_at desc,recent.id desc
       limit 40)
     and exists(select 1 from private.construction_client_publications e
       where e.organization_id=p_org and e.project_id=p_project
         and e.report_id=r.id and e.decision='publish'
         and e.sequence=(select max(later.sequence)
           from private.construction_client_publications later
           where later.organization_id=p_org and later.project_id=p_project
             and later.report_id=r.id))
     and exists(select 1 from private.site_report_reviews review
       where review.organization_id=p_org and review.project_id=p_project
         and review.report_id=r.id and review.decision='approved'
         and review.id=(select latest.id from private.site_report_reviews latest
           where latest.organization_id=p_org and latest.project_id=p_project
             and latest.report_id=r.id order by latest.review_sequence desc limit 1))
   ),'[]'::jsonb),
 'as_of',clock_timestamp());
end$$;

revoke all on function private.construction_client_user_allowed(uuid,uuid),
 public.construction_client_access_manage(uuid,uuid,text,jsonb),
 public.construction_client_access_manage_read(uuid,uuid),
 public.construction_client_projects(),
 public.construction_client_project_view(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.construction_client_access_manage(uuid,uuid,text,jsonb),
 public.construction_client_access_manage_read(uuid,uuid),
 public.construction_client_projects(),
 public.construction_client_project_view(uuid,uuid) to authenticated;
commit;
