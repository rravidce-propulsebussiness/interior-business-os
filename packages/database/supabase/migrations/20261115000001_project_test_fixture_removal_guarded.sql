CREATE OR REPLACE FUNCTION private.delete_test_project_fixture(p_org uuid,p_project uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v public.projects%ROWTYPE; cs uuid[]; ps uuid[]; t record; pred text; n integer; total integer; pass integer:=0;
BEGIN
 IF NOT private.owner_test_reset_allowed(p_org) OR NOT private.has_permission(p_org,'organization.manage')
 OR NOT private.commercial_access(p_org,'project.manage','projects') THEN
  RAISE EXCEPTION 'Owner permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM public.projects WHERE organization_id=p_org AND id=p_project FOR UPDATE;
 IF v.id IS NULL OR v.name IS DISTINCT FROM 'TEST ONLY — Project Management Workflow Demo'
 OR v.notes IS DISTINCT FROM 'TEST ONLY — synthetic internal workflow record. No real customer; do not contact.'
 OR NOT EXISTS(SELECT 1 FROM public.customers WHERE organization_id=p_org AND id=v.customer_id
  AND display_name='TEST ONLY — ProPulse Workflow QA') THEN RAISE EXCEPTION 'Not the exact TEST ONLY fixture' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.quotations WHERE organization_id=p_org AND project_id=p_project)
 OR EXISTS(SELECT 1 FROM public.invoices WHERE organization_id=p_org AND project_id=p_project)
 OR EXISTS(SELECT 1 FROM private.gst_stage_invoice_links WHERE organization_id=p_org AND project_id=p_project)
 OR EXISTS(SELECT 1 FROM private.labour_disbursements WHERE organization_id=p_org AND project_id=p_project) THEN RAISE EXCEPTION 'Unexpected commercial records' USING ERRCODE='23503'; END IF;
 SELECT array_agg(id) INTO cs FROM public.contracts WHERE organization_id=p_org AND project_id=p_project;
 IF coalesce(array_length(cs,1),0)<>1 OR EXISTS(SELECT 1 FROM public.contracts WHERE id=ANY(cs)
  AND status_reason NOT LIKE 'Owner confirmed that the final quotation is the agreed scope%') THEN RAISE EXCEPTION 'Unexpected contract' USING ERRCODE='23503'; END IF;
 SELECT array_agg(id) INTO ps FROM public.payments WHERE organization_id=p_org AND project_id=p_project;
 IF coalesce(array_length(ps,1),0)<>1 OR EXISTS(SELECT 1 FROM public.payments WHERE id=ANY(ps)
  AND notes NOT LIKE 'TEST ONLY — homeowner cash received;%') THEN RAISE EXCEPTION 'Unexpected payment' USING ERRCODE='23503'; END IF;
 IF (SELECT count(*) FROM public.receipts WHERE contract_id=ANY(cs))<>1 OR EXISTS(
  SELECT 1 FROM public.receipts WHERE contract_id=ANY(cs)
  AND (document_snapshot #>> '{project,name}') IS DISTINCT FROM 'TEST ONLY — Project Management Workflow Demo') THEN RAISE EXCEPTION 'Unexpected receipt' USING ERRCODE='23503'; END IF;
 PERFORM pg_catalog.set_config('business_os.test_reset_org',p_org::text,true);
 LOOP
  pass:=pass+1; total:=0;
  FOR t IN SELECT ns.nspname s,c.relname r,bool_or(a.attname='project_id') hp,
   bool_or(a.attname='contract_id') hc,bool_or(a.attname='payment_id') hpay,
   bool_or(a.attname='organization_id') ho
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
  WHERE ns.nspname IN('public','private') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
  GROUP BY ns.nspname,c.relname HAVING bool_or(a.attname IN('project_id','contract_id','payment_id'))
  LOOP
   IF t.s='public' AND t.r IN('projects','leads','quotations','audit_logs') THEN CONTINUE; END IF;
   pred:='('||concat_ws(' OR ',CASE WHEN t.hp THEN 'project_id=$1' END,
     CASE WHEN t.hc THEN 'contract_id=ANY($2)' END,CASE WHEN t.hpay THEN 'payment_id=ANY($3)' END)||')';
   IF t.ho THEN pred:=pred||' AND organization_id=$4'; END IF;
   BEGIN
    EXECUTE format('DELETE FROM %I.%I WHERE %s',t.s,t.r,pred) USING p_project,cs,ps,p_org;
    GET DIAGNOSTICS n=ROW_COUNT; total:=total+n;
   EXCEPTION WHEN foreign_key_violation THEN NULL;
   END;
  END LOOP;
  EXIT WHEN total=0;
  IF pass>80 THEN RAISE EXCEPTION 'Cleanup stalled; rolled back' USING ERRCODE='23503'; END IF;
 END LOOP;
 UPDATE public.leads SET converted_project_id=NULL,converted_customer_id=NULL,converted_at=NULL,converted_by=NULL,version=version+1
  WHERE organization_id=p_org AND converted_project_id=p_project;
 PERFORM pg_catalog.set_config('business_os.test_reset_org','',true);
END;$f$;
REVOKE ALL ON FUNCTION private.delete_test_project_fixture(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.project_permanent_delete(p_org uuid,p_project uuid,p_version integer,p_confirm text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v public.projects%ROWTYPE; fk record; match_sql text; children boolean; leads integer;
BEGIN
 IF p_org IS NULL OR p_project IS NULL OR p_version IS NULL OR p_version<1 OR p_confirm IS DISTINCT FROM 'DELETE' THEN
  RAISE EXCEPTION 'Type DELETE to confirm permanent project deletion' USING ERRCODE='22023'; END IF;
 IF NOT private.commercial_access(p_org,'project.manage','projects') OR NOT private.has_permission(p_org,'organization.manage') THEN
  RAISE EXCEPTION 'Only an authorized company administrator can permanently delete projects' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM public.projects WHERE organization_id=p_org AND id=p_project FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Project not found in this company' USING ERRCODE='42501'; END IF;
 IF v.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Project changed. Refresh and try again' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.quotations WHERE organization_id=p_org AND project_id=p_project) THEN
  RAISE EXCEPTION 'This project has linked quotations. Remove or resolve those quotations before permanent deletion' USING ERRCODE='23503'; END IF;
 IF v.name='TEST ONLY — Project Management Workflow Demo'
 AND v.notes='TEST ONLY — synthetic internal workflow record. No real customer; do not contact.'
 AND EXISTS(SELECT 1 FROM public.customers c WHERE c.organization_id=p_org AND c.id=v.customer_id AND c.display_name='TEST ONLY — ProPulse Workflow QA') THEN
  PERFORM private.delete_test_project_fixture(p_org,p_project);
  UPDATE public.leads SET converted_project_id=NULL,converted_customer_id=NULL,converted_at=NULL,converted_by=NULL,version=version+1
   WHERE organization_id=p_org AND converted_project_id=p_project;
  GET DIAGNOSTICS leads=ROW_COUNT;
  DELETE FROM public.projects WHERE organization_id=p_org AND id=p_project AND version=p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project changed. Refresh and try again' USING ERRCODE='40001'; END IF;
  INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
   VALUES(auth.uid(),p_org,'project.test_fixture_permanently_deleted','project',p_project::text,
    jsonb_build_object('project_name',v.name,'unlinked_leads',leads));
  RETURN true;
 END IF;
 IF EXISTS(SELECT 1 FROM public.contracts WHERE organization_id=p_org AND project_id=p_project)
 OR EXISTS(SELECT 1 FROM private.gst_stage_invoice_links WHERE organization_id=p_org AND project_id=p_project)
 OR EXISTS(SELECT 1 FROM private.labour_disbursements WHERE organization_id=p_org AND project_id=p_project) THEN
  RAISE EXCEPTION 'This project has protected contracts, invoices or payment records and cannot be deleted' USING ERRCODE='23503'; END IF;
 FOR fk IN SELECT c.conrelid,c.conkey,c.confkey,n.nspname s,t.relname r FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
  WHERE c.contype='f' AND c.confrelid='public.projects'::regclass AND c.conrelid<>'public.leads'::regclass
 LOOP
  SELECT string_agg(format('d.%I=p.%I',a.attname,b.attname),' AND ') INTO match_sql
   FROM unnest(fk.conkey,fk.confkey) k(x,y)
   JOIN pg_catalog.pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.x
   JOIN pg_catalog.pg_attribute b ON b.attrelid='public.projects'::regclass AND b.attnum=k.y;
  IF match_sql IS NULL THEN RAISE EXCEPTION 'Could not verify project deletion dependencies' USING ERRCODE='23503'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I d JOIN public.projects p ON %s WHERE p.organization_id=$1 AND p.id=$2)',fk.s,fk.r,match_sql)
   INTO children USING p_org,p_project;
  IF children THEN RAISE EXCEPTION 'This project has linked % records. Remove related data before permanent deletion',replace(fk.r,'_',' ') USING ERRCODE='23503'; END IF;
 END LOOP;
 UPDATE public.leads SET converted_project_id=NULL,converted_customer_id=NULL,converted_at=NULL,converted_by=NULL,version=version+1
  WHERE organization_id=p_org AND converted_project_id=p_project;
 GET DIAGNOSTICS leads=ROW_COUNT;
 DELETE FROM public.projects WHERE organization_id=p_org AND id=p_project AND version=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project changed. Refresh and try again' USING ERRCODE='40001'; END IF;
 INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),p_org,'project.permanently_deleted','project',p_project::text,
   jsonb_build_object('project_name',v.name,'previous_status',v.status,'unlinked_leads',leads));
 RETURN true;
END;$f$;