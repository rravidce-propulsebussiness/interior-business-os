-- Clients can use the portal only after agreement completion and any
-- required advance has been recorded. Active project/prospect status alone is
-- not confirmation. Continue to scope each verified email to one project.
begin;
create or replace function private.client_portal_eligible(p_org uuid,p_project uuid)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
  select 1 from public.projects p
   join public.customers c on c.organization_id=p.organization_id and c.id=p.customer_id
   where p.organization_id=p_org and p.id=p_project
     and p.status='active' and c.status='active'
     and not p.is_sales_prospect and not c.is_sales_prospect
 ) and private.project_agreement_authorized(p_org,p_project);
$fn$;
revoke all on function private.client_portal_eligible(uuid,uuid) from public,anon,authenticated;

create or replace function private.client_portal_accessible(p_project uuid)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
  select 1 from private.client_project_access a
    where a.project_id=p_project and a.active
      and a.email=private.client_portal_verified_email()
      and private.client_portal_eligible(a.organization_id,a.project_id)
 );
$fn$;

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
     and p.customer_id=p_customer_id
 ) then raise exception 'Project does not belong to this client' using errcode='42501';end if;
 if p_active and not private.client_portal_eligible(p_organization_id,p_project_id)
 then raise exception 'Complete agreement and record advance before enabling client app access'
      using errcode='42501';end if;
 insert into private.client_project_access
  (organization_id,customer_id,project_id,email,active,added_by)
 values(p_organization_id,p_customer_id,p_project_id,v_email,p_active,auth.uid())
 on conflict(organization_id,project_id,email)
 do update set active=excluded.active,updated_at=now(),added_by=excluded.added_by;
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
  and c.status='active' and not p.is_sales_prospect and not c.is_sales_prospect
  and private.client_portal_eligible(a.organization_id,a.project_id);
 return result;
end; $$;

-- Limit the project's invitation dropdown to confirmed, execution-authorized projects.
create or replace function public.client_portal_grantable_projects(
 p_organization_id uuid,p_customer_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.commercial_access(p_organization_id,'customer.manage','customers')
 then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
     from public.projects p
    where p.organization_id=p_organization_id and p.customer_id=p_customer_id
      and private.client_portal_eligible(p.organization_id,p.id)
 ),'[]'::jsonb);
end $fn$;
revoke all on function public.client_portal_grantable_projects(uuid,uuid)
 from public,anon;
grant execute on function public.client_portal_grantable_projects(uuid,uuid)
 to authenticated;
commit;
