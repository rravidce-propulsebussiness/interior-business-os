-- Invoice picker: one option per existing CRM customer, with their matching
-- Won lead displayed as context. A Won lead without an existing customer remains
-- selectable and can be invoiced without creating a project or new customer.
CREATE OR REPLACE FUNCTION public.gst_invoice_customer_options(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM private.finance_require_read(p_org,'invoice.create');
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(t)) FROM (
      SELECT * FROM (
        SELECT c.id,c.display_name,c.legal_name,c.phone,c.email,
               c.tax_identifier,c.billing_address,
               found.id AS won_lead_id,found.lead_number AS won_lead_number,
               'customer'::text AS selection_source
        FROM public.customers c
        LEFT JOIN LATERAL (
          SELECT l.id,l.lead_number FROM public.leads l
          WHERE l.organization_id=p_org AND l.lifecycle='won'
            AND l.converted_customer_id IS NULL
            AND lower(trim(l.name))=lower(trim(c.display_name))
            AND ((coalesce(l.phone_normalized,'')<>'' AND
                  private.normalize_crm_phone(c.phone)=l.phone_normalized)
              OR (coalesce(l.email_normalized,'')<>'' AND
                  lower(trim(coalesce(c.email,'')))=l.email_normalized))
          ORDER BY l.created_at DESC,l.id DESC LIMIT 1
        ) found ON true
        WHERE c.organization_id=p_org AND c.status='active'
          AND c.is_sales_prospect=false
        UNION ALL
        SELECT l.id,l.name,qclient.legal_name,l.phone,l.email,
               qclient.tax_identifier,
               COALESCE(qclient.billing_address,l.site_address),
               l.id,l.lead_number,'won_lead'::text AS selection_source
        FROM public.leads l
        LEFT JOIN LATERAL (
          SELECT c.legal_name,c.tax_identifier,c.billing_address
          FROM private.lead_quotation_links lk
          JOIN public.quotations q ON q.id=lk.quotation_id AND q.organization_id=p_org
          JOIN public.customers c ON c.id=q.customer_id AND c.organization_id=p_org
          WHERE lk.lead_id=l.id AND lk.organization_id=p_org AND c.status='active'
          ORDER BY q.created_at DESC,q.id DESC LIMIT 1
        ) qclient ON true
        WHERE l.organization_id=p_org AND l.lifecycle='won'
          AND l.converted_customer_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.customers c
            WHERE c.organization_id=p_org AND c.status='active'
              AND c.is_sales_prospect=false
              AND lower(trim(c.display_name))=lower(trim(l.name))
              AND ((coalesce(l.phone_normalized,'')<>'' AND
                    private.normalize_crm_phone(c.phone)=l.phone_normalized)
                OR (coalesce(l.email_normalized,'')<>'' AND
                    lower(trim(coalesce(c.email,'')))=l.email_normalized))
          )
      ) pool ORDER BY display_name,id LIMIT 1000
    ) t
  ),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.gst_invoice_customer_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_invoice_customer_options(uuid) TO authenticated;

-- Preserve original CRM conversion logic, including quotation/project reuse,
-- tenant isolation, removed-project protection and optimistic version checks.
-- Only its fallback customer-creation path changes to reuse one exact match.
CREATE OR REPLACE FUNCTION public.crm_convert(p_organization_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.leads;c public.customers;p public.projects;org uuid=p_organization_id;customer uuid;project uuid;matched_id uuid;matched_count bigint;begin
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
 -- Reuse a uniquely matched ACTIVE customer by BOTH name and contact.
 -- Never guess when a phone is shared or customer identities are ambiguous.
 if customer is null then
  select count(*),min(c2.id) into matched_count,matched_id
    from public.customers c2
   where c2.organization_id=org and c2.status='active'
     and c2.is_sales_prospect=false
     and lower(trim(c2.display_name))=lower(trim(l.name))
     and (
       (coalesce(l.phone_normalized,'')<>'' and
         private.normalize_crm_phone(c2.phone)=l.phone_normalized)
       or (coalesce(l.email_normalized,'')<>'' and
         lower(trim(coalesce(c2.email,'')))=l.email_normalized)
     );
  if matched_count=1 then customer=matched_id; end if;
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

