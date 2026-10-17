-- A quote owns an immutable reference to its project. When a real delivery
-- project has quotation history but NO delivery/financial work, remove it from
-- the Projects workspace by retaining that minimum quotation-only reference.
-- Quotation/revision/item records remain byte-for-byte unchanged.
-- Projects without quotations are physically deleted by the existing guarded RPC.
CREATE FUNCTION public.project_remove_from_workspace(
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
  -- neither a deliverable project nor an inactive project on the dashboard.
  UPDATE public.projects SET is_sales_prospect=true,status='inactive',
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
