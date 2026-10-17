-- Preserve one hidden quotation-backed project reference without allowing CRM
-- conversion or inline Open Project to resurrect removed delivery work.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS
  removed_from_workspace boolean NOT NULL DEFAULT false;

-- Override the previous migration's removal function in place. All existing
-- permission checks, FK preflights, audit logging and rollback behavior stay intact.
DO $patch$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public.project_remove_from_workspace(uuid,uuid,integer,text)'::regprocedure)
    INTO def;
  IF def IS NULL OR position('is_sales_prospect=true' in def)=0
      OR position('public.project_permanent_delete' in def)=0 THEN
    RAISE EXCEPTION 'Project-removal function has changed; inspect before updating';
  END IF;
  def:=replace(def,'SET is_sales_prospect=true,',
                   'SET is_sales_prospect=true,removed_from_workspace=true,');
  EXECUTE def;
END $patch$;

-- On conversion reuse the customer and normal provisional quote project. If an
-- older quotation references a removed project, create a NEW delivery project
-- for the existing customer. Never promote a removed project back to Projects.
CREATE OR REPLACE FUNCTION public.crm_convert(p_organization_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.leads;c public.customers;p public.projects;org uuid=p_organization_id;customer uuid;project uuid;begin
 perform 1 from public.organizations where id=org for update;
 perform private.crm_require(org,'lead.convert');
 if not private.commercial_access(org,'customer.view','customers') or not private.commercial_access(org,'project.view','projects') then raise exception 'Forbidden' using errcode='42501';end if;
 select * into l from public.leads where organization_id=org and id=(p_input->>'id')::uuid for update;
 if l.id is null then raise exception 'Unavailable lead' using errcode='42501';end if;
 if l.converted_at is not null then return jsonb_build_object('customer_id',l.converted_customer_id,'project_id',l.converted_project_id);end if;
 if l.lifecycle<>'won' then raise exception 'Closed-Won lead required' using errcode='22023';end if;
 if l.version is distinct from (p_input->>'version')::integer then raise exception 'Stale lead' using errcode='40001';end if;
 customer=(p_input->>'customer_id')::uuid;project=(p_input->>'project_id')::uuid;
 -- Reuse the commercial project created for the quotation. Do not issue
 -- duplicate CRNs/projects when a won lead enters delivery.
 if customer is null and project is null then
   select q.customer_id,
     case when qp.removed_from_workspace then null::uuid else q.project_id end
     into customer,project
   from private.lead_quotation_links link
   join public.quotations q
     on q.organization_id=link.organization_id and q.id=link.quotation_id
   join public.projects qp
     on qp.organization_id=org and qp.id=q.project_id and qp.customer_id=q.customer_id
   where link.organization_id=org and link.lead_id=l.id and q.status<>'cancelled'
   order by link.created_at desc,q.created_at desc limit 1;
 end if;
 if project is not null and customer is null then
   raise exception 'Project requires its existing customer' using errcode='22023';
 end if;
 if customer is null then
  if not private.commercial_access(org,'customer.create','customers') then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from public.customers where organization_id=org and ((l.phone_normalized<>'' and private.normalize_crm_phone(phone)=l.phone_normalized) or (l.email_normalized<>'' and lower(trim(email))=l.email_normalized))) and coalesce((p_input->>'acknowledge_duplicate')::boolean,false)=false then raise exception 'Acknowledge possible customer match' using errcode='22023';end if;
  insert into public.customers(organization_id,display_name,legal_name,customer_type,phone,secondary_phone,email) values(org,l.name,l.company_name,case when l.company_name='' then 'individual' else 'business' end,l.phone,l.secondary_phone,l.email) returning id into customer;
 else
  select * into c from public.customers where organization_id=org and id=customer and status='active';
  if c.id is null then raise exception 'Unavailable customer' using errcode='42501';end if;
 end if;
 if project is null then
  if not private.commercial_access(org,'project.create','projects') then raise exception 'Forbidden' using errcode='42501';end if;
  perform private.crm_assignee(org,l.assigned_to,l.branch_id);
  insert into public.projects(organization_id,customer_id,name,code,industry_id,branch_id,project_type,site_address,notes,assigned_user_id) values(org,customer,coalesce(nullif(trim(p_input->>'project_name'),''),l.name),'P-'||replace(l.id::text,'-',''),l.industry_id,l.branch_id,l.service_type,l.site_address,left(l.notes,10000),l.assigned_to) returning id into project;
 else
  select * into p from public.projects where organization_id=org and id=project and customer_id=customer and status='active' and not removed_from_workspace;
  if p.id is null then raise exception 'Unavailable project' using errcode='42501';end if;
  if exists(select 1 from public.leads where organization_id=org and converted_project_id=project) then raise exception 'Project already attributed' using errcode='40001';end if;
  if p.is_sales_prospect then
    if length(trim(coalesce(p_input->>'project_name',''))) not between 1 and 200 then
      raise exception 'Project name required after Won' using errcode='22023';
    end if;
    update public.projects
       set name=trim(p_input->>'project_name')
     where organization_id=org and id=project and is_sales_prospect;
  end if;
 end if;
 update public.leads set converted_customer_id=customer,converted_project_id=project,converted_at=now(),converted_by=auth.uid(),version=version+1 where id=l.id;
 update public.site_visits set project_id=project,version=version+1 where organization_id=org and lead_id=l.id;
 perform private.crm_event(org,l.id,'conversion','Converted to customer and project',jsonb_build_object('customer_id',customer,'project_id',project));
 perform private.crm_audit(org,'lead.converted','leads',l.id);
 return jsonb_build_object('customer_id',customer,'project_id',project);
end$function$;
