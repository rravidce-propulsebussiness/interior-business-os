-- Explicit, authorized HARD delete. Never archive and never cascade paid work.
-- A project with invoices, contracts, quotations, site data or other dependent
-- records cannot be deleted until its dependencies have been resolved.
-- Converted CRM leads survive; their conversion link is cleared atomically.
CREATE FUNCTION public.project_permanent_delete(
  p_org uuid, p_project uuid, p_version integer, p_confirm text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_fk record;
  v_match text;
  v_has_children boolean;
  v_leads integer;
BEGIN
  IF p_org IS NULL OR p_project IS NULL OR p_version IS NULL OR p_version < 1
    OR p_confirm IS DISTINCT FROM 'DELETE' THEN
    RAISE EXCEPTION 'Type DELETE to confirm permanent project deletion'
      USING ERRCODE='22023';
  END IF;
  IF NOT private.commercial_access(p_org,'project.manage','projects')
     OR NOT private.has_permission(p_org,'organization.manage') THEN
    RAISE EXCEPTION 'Only an authorized company administrator can permanently delete projects'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_project FROM public.projects p
   WHERE p.organization_id=p_org AND p.id=p_project FOR UPDATE;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Project not found in this company' USING ERRCODE='42501';
  END IF;
  IF v_project.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'Project changed. Refresh and try again' USING ERRCODE='40001';
  END IF;

  -- Give actionable errors for the most important dependencies. These are
  -- immutable/auditable records and must never be silently hard-deleted.
  IF EXISTS(SELECT 1 FROM public.quotations q
            WHERE q.organization_id=p_org AND q.project_id=p_project) THEN
    RAISE EXCEPTION 'This project has linked quotations. Remove or resolve those quotations before permanent deletion'
      USING ERRCODE='23503';
  END IF;
  IF EXISTS(SELECT 1 FROM public.contracts c
            WHERE c.organization_id=p_org AND c.project_id=p_project)
     OR EXISTS(SELECT 1 FROM private.gst_stage_invoice_links i
            WHERE i.organization_id=p_org AND i.project_id=p_project)
     OR EXISTS(SELECT 1 FROM private.labour_disbursements d
            WHERE d.organization_id=p_org AND d.project_id=p_project) THEN
    RAISE EXCEPTION 'This project has protected contracts, invoices or payment records and cannot be deleted'
      USING ERRCODE='23503';
  END IF;

  -- Check every FOREIGN KEY to public.projects, including future ones.
  -- This safely refuses deletion of site media, procurement, execution data
  -- and other records, rather than assuming a static list stays complete.
  -- The only exception is converted leads, whose link is cleared below.
  FOR v_fk IN
    SELECT fk.conrelid, fk.conkey, fk.confkey,
           ns.nspname AS child_schema, tbl.relname AS child_table
    FROM pg_catalog.pg_constraint fk
    JOIN pg_catalog.pg_class tbl ON tbl.oid=fk.conrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid=tbl.relnamespace
    WHERE fk.contype='f' AND fk.confrelid='public.projects'::regclass
      AND fk.conrelid<>'public.leads'::regclass
  LOOP
    SELECT string_agg(
      format('dependency.%I=target.%I', source.attname, destination.attname),
      ' AND '
    )
    INTO v_match
    FROM unnest(v_fk.conkey,v_fk.confkey) AS keys(source_num,target_num)
    JOIN pg_catalog.pg_attribute source
      ON source.attrelid=v_fk.conrelid AND source.attnum=keys.source_num
    JOIN pg_catalog.pg_attribute destination
      ON destination.attrelid='public.projects'::regclass
      AND destination.attnum=keys.target_num;
    IF v_match IS NULL THEN
      RAISE EXCEPTION 'Could not verify project deletion dependencies'
        USING ERRCODE='23503';
    END IF;
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM %I.%I dependency JOIN public.projects target ON %s WHERE target.organization_id=$1 AND target.id=$2)',
      v_fk.child_schema,v_fk.child_table,v_match
    ) INTO v_has_children USING p_org,p_project;
    IF v_has_children THEN
      RAISE EXCEPTION 'This project has linked % records. Remove related data before permanent deletion',
        replace(v_fk.child_table,'_',' ')
        USING ERRCODE='23503';
    END IF;
  END LOOP;

  -- Preserve the lead and customer. The Won lead may create another project
  -- later; removing the project must not remove the original enquiry.
  UPDATE public.leads
     SET converted_project_id=NULL,converted_customer_id=NULL,
         converted_at=NULL,converted_by=NULL,version=version+1
   WHERE organization_id=p_org AND converted_project_id=p_project;
  GET DIAGNOSTICS v_leads=ROW_COUNT;

  DELETE FROM public.projects p
   WHERE p.organization_id=p_org AND p.id=p_project AND p.version=p_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project changed. Refresh and try again' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.audit_logs
    (actor_user_id,organization_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),p_org,'project.permanently_deleted','project',
         p_project::text,jsonb_build_object(
           'project_name',v_project.name,'previous_status',v_project.status,
           'unlinked_leads',v_leads));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.project_permanent_delete(uuid,uuid,integer,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_permanent_delete(uuid,uuid,integer,text)
 TO authenticated;
