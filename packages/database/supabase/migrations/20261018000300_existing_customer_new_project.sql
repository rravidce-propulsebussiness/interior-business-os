-- Create additional delivery projects for an existing client without creating
-- another CRN, enquiry, sales-prospect shell, or a second execution workspace.
-- New projects remain pre-agreement; all existing execution gates still apply.
begin;
create function public.customer_project_create(
 p_org uuid,p_customer uuid,p_name text,p_industry_key text,
 p_project_type text,p_site_city text,p_request_id uuid
) returns uuid language plpgsql security definer set search_path='' as $create$
declare
 v_industry uuid;v_id uuid;v_code text;v_current public.projects;
begin
 if auth.uid() is null
    or not private.commercial_access(p_org,'project.create','projects')
    or not private.commercial_access(p_org,'customer.view','customers')
 then raise exception 'Project creation requires authorized company access' using errcode='42501';end if;
 if p_customer is null or p_request_id is null
   or length(trim(coalesce(p_name,''))) not between 3 and 200
   or p_industry_key not in ('construction','interior')
   or p_project_type not in ('Residential','Commercial','Renovation','Extension','Apartment','Villa','Office')
   or length(trim(coalesce(p_site_city,''))) not between 2 and 200
 then raise exception 'Enter a valid project name, service, type and site city' using errcode='22023';end if;
 if not exists(select 1 from public.customers where organization_id=p_org
   and id=p_customer and status='active' and is_sales_prospect=false)
 then raise exception 'An active existing client is required' using errcode='42501';end if;
 select id into v_industry from public.industries
   where key=p_industry_key and status='active' limit 1;
 if v_industry is null then raise exception 'Project service unavailable' using errcode='22023';end if;
 v_code='P-'||upper(replace(p_request_id::text,'-',''));
 -- Server-side request ID makes double-submits/retries idempotent per company.
 select * into v_current from public.projects where organization_id=p_org and code=v_code;
 if found then
   if v_current.customer_id<>p_customer or v_current.name<>trim(p_name)
       or v_current.industry_id<>v_industry or v_current.project_type<>p_project_type
       or coalesce(v_current.site_address->>'city','')<>trim(p_site_city)
   then raise exception 'Project request ID already used' using errcode='23505';end if;
   return v_current.id;
 end if;
 insert into public.projects(organization_id,customer_id,name,code,
   industry_id,project_type,site_address,status,notes,is_sales_prospect,
   removed_from_workspace)
 values(p_org,p_customer,trim(p_name),v_code,v_industry,p_project_type,
   jsonb_build_object('line1','','line2','','city',trim(p_site_city),
       'region','','postal_code','','country_code','IN'),
   'active','',false,false)
 on conflict (organization_id,code) do nothing returning id into v_id;
 if v_id is null then
   select * into v_current from public.projects where organization_id=p_org and code=v_code;
   if v_current.customer_id is distinct from p_customer or v_current.name is distinct from trim(p_name)
      or v_current.industry_id is distinct from v_industry
   then raise exception 'Request reused for another project' using errcode='23505';end if;
   v_id=v_current.id;
 end if;
 perform private.crm_audit(p_org,'customer.project.created','projects',v_id);
 return v_id;
end $create$;
revoke all on function public.customer_project_create(uuid,uuid,text,text,text,text,uuid) from public,anon;
grant execute on function public.customer_project_create(uuid,uuid,text,text,text,text,uuid) to authenticated;
commit;
