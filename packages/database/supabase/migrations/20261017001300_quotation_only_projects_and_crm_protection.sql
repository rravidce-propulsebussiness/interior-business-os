-- Differentiates hidden quotation-history references from active quotation prospects.
-- Existing PDFs/quotations remain unchanged and old references remain valid.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_quotation_archive boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.projects.is_quotation_archive IS 'Project retained solely for immutable quotation history after delivery removal; never eligible for Won-lead conversion.';

-- A quote owns an immutable reference to its project. When a real delivery
-- project has quotation history but NO delivery/financial work, remove it from
-- the Projects workspace by retaining that minimum quotation-only reference.
-- Quotation/revision/item records remain byte-for-byte unchanged.
-- Projects without quotations are physically deleted by the existing guarded RPC.
CREATE OR REPLACE FUNCTION public.project_remove_from_workspace(
  p_org uuid,p_project uuid,p_version integer,p_confirm text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_quote_count integer;
  v_fk record;
  v_table record;
  v_match text;
  v_has_children boolean;
  v_unlinked integer := 0;
BEGIN
  IF p_org IS NULL OR p_project IS NULL OR p_version IS NULL OR p_version<1
      OR p_confirm IS DISTINCT FROM 'DELETE' THEN
    RAISE EXCEPTION 'Type DELETE to confirm removal' USING ERRCODE='22023';
  END IF;
  IF NOT private.commercial_access(p_org,'project.manage','projects')
      OR NOT private.has_permission(p_org,'organization.manage') THEN
    RAISE EXCEPTION 'Only a company administrator can remove projects'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_project FROM public.projects
    WHERE organization_id=p_org AND id=p_project FOR UPDATE;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE='42501';
  END IF;
  IF v_project.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'Project changed. Refresh and try again' USING ERRCODE='40001';
  END IF;
  IF v_project.is_sales_prospect THEN
    RAISE EXCEPTION 'Quotation-only references cannot be deleted here'
      USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_quote_count
    FROM public.quotations q
   WHERE q.organization_id=p_org AND q.project_id=p_project;

  IF v_quote_count=0 THEN
    PERFORM public.project_permanent_delete(p_org,p_project,p_version,p_confirm);
    RETURN 'permanently_deleted';
  END IF;

  -- Quotations, their revisions, items and lead links are preserved in place.
  -- Any unrelated FK-backed business data (contracts, site updates, materials,
  -- client access, execution plans, invoices...) must block removal.
  FOR v_fk IN
    SELECT fk.conrelid,fk.conkey,fk.confkey,ns.nspname schema_name,t.relname table_name
      FROM pg_catalog.pg_constraint fk
      JOIN pg_catalog.pg_class t ON t.oid=fk.conrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid=t.relnamespace
     WHERE fk.contype='f' AND fk.confrelid='public.projects'::regclass
       AND fk.conrelid NOT IN (
         'public.quotations'::regclass,
         'private.lead_quotation_links'::regclass,
         'public.leads'::regclass
       )
  LOOP
    SELECT string_agg(
      format('dependency.%I=target.%I',src.attname,dst.attname),' AND '
    ) INTO v_match
    FROM unnest(v_fk.conkey,v_fk.confkey) AS k(s,d)
    JOIN pg_catalog.pg_attribute src
      ON src.attrelid=v_fk.conrelid AND src.attnum=k.s
    JOIN pg_catalog.pg_attribute dst
      ON dst.attrelid='public.projects'::regclass AND dst.attnum=k.d;
    IF v_match IS NULL THEN
      RAISE EXCEPTION 'Unable to verify linked project records'
        USING ERRCODE='23503';
    END IF;
    EXECUTE format('SELECT EXISTS(
      SELECT 1 FROM %I.%I dependency JOIN public.projects target
        ON %s WHERE target.organization_id=$1 AND target.id=$2
    )',v_fk.schema_name,v_fk.table_name,v_match)
      INTO v_has_children USING p_org,p_project;
    IF v_has_children THEN
      RAISE EXCEPTION 'Project has % records. Remove these records before deleting the project',
        replace(v_fk.table_name,'_',' ') USING ERRCODE='23503';
    END IF;
  END LOOP;

  -- Some older modules store project_id without an FK. Check them as well,
  -- failing closed on any record outside quotation history.
  FOR v_table IN
    SELECT ns.nspname schema_name,t.relname table_name
    FROM pg_catalog.pg_class t
    JOIN pg_catalog.pg_namespace ns ON ns.oid=t.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid
    WHERE ns.nspname IN ('public','private')
      AND t.relkind='r' AND a.attname='project_id'
      AND a.attnum>0 AND NOT a.attisdropped
      AND (ns.nspname,t.relname) NOT IN (
        ('public','quotations'),('public','quotation_revisions'),
        ('public','quotation_items'),('private','lead_quotation_links')
      )
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE project_id=$1)',
      v_table.schema_name,v_table.table_name)
    INTO v_has_children USING p_project;
    IF v_has_children THEN
      RAISE EXCEPTION 'Project has % records. Remove these records before deleting the project',
       replace(v_table.table_name,'_',' ') USING ERRCODE='23503';
    END IF;
  END LOOP;

  -- A Won lead remains a Won lead and the customer is not deleted.
  -- Clear only the delivery-project conversion so the lead can start a new
  -- delivery project in the future.
  UPDATE public.leads SET converted_project_id=NULL,
      converted_customer_id=NULL,converted_at=NULL,converted_by=NULL,
      version=version+1
  WHERE organization_id=p_org AND converted_project_id=p_project;
  GET DIAGNOSTICS v_unlinked=ROW_COUNT;

  -- Keep exactly the record that immutable quotations require, but it is
  -- not a deliverable project on the dashboard; retain active quote access.
  UPDATE public.projects SET is_sales_prospect=true,is_quotation_archive=true,
         version=version+1
  WHERE organization_id=p_org AND id=p_project AND version=p_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project changed. Refresh and try again' USING ERRCODE='40001';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id,organization_id,action,entity_type,entity_id,metadata
  ) VALUES(
    auth.uid(),p_org,'project.removed_quotation_history_retained',
    'project',p_project::text,
    jsonb_build_object('project_name',v_project.name,
      'preserved_quotations',v_quote_count,'unlinked_leads',v_unlinked)
  );
  RETURN 'removed_quotes_preserved';
END;
$$;
REVOKE ALL ON FUNCTION public.project_remove_from_workspace(uuid,uuid,integer,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_remove_from_workspace(uuid,uuid,integer,text)
 TO authenticated;


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
   select q.customer_id,q.project_id into customer,project
   from private.lead_quotation_links link
   join public.quotations q
     on q.organization_id=link.organization_id and q.id=link.quotation_id
   where link.organization_id=org and link.lead_id=l.id and q.status<>'cancelled'
   order by link.created_at desc,q.created_at desc limit 1;
 end if;
 -- Historical quotation-only references are not delivery projects. Keep
 -- their customer but create a new delivery project instead of reopening one.
 if project is not null and exists(select 1 from public.projects archived
   where archived.organization_id=org and archived.id=project and archived.is_quotation_archive) then
   project=null;
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
  select * into p from public.projects where organization_id=org and id=project and customer_id=customer and status='active' and is_quotation_archive=false;
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
end$function$

