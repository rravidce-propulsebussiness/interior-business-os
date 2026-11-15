CREATE OR REPLACE FUNCTION private.ops_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $f$
DECLARE
  v_org uuid;
  v_project uuid;
  v_contract uuid;
BEGIN
  IF tg_op='DELETE' AND tg_table_schema='private' AND tg_table_name='project_agreement_events' THEN
    v_org:=old.organization_id;
    v_project:=old.project_id;
    v_contract:=old.contract_id;
    IF v_project IS NULL AND v_contract IS NOT NULL THEN
      SELECT c.project_id INTO v_project
      FROM public.contracts c
      WHERE c.organization_id=v_org AND c.id=v_contract;
    END IF;
    IF coalesce(current_setting('business_os.test_reset_org',true),'')=coalesce(v_org::text,'')
       AND v_project IS NOT NULL
       AND private.test_fixture_cleanup_allowed(v_org,v_project) THEN
      RETURN old;
    END IF;
  END IF;
  RAISE EXCEPTION 'Historical records are immutable; append a correction' USING ERRCODE='23514';
END;
$f$;
