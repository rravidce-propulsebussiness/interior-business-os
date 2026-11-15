CREATE OR REPLACE FUNCTION private.ops_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $f$
DECLARE
  v_org uuid;
  v_project uuid;
  v_contract uuid;
BEGIN
  IF tg_op='DELETE'
     AND (tg_table_schema,tg_table_name) IN (
       ('private','construction_stage_clearances'),
       ('private','construction_stage_inspections'),
       ('private','construction_stage_record_links'),
       ('private','construction_stage_reviews'),
       ('private','project_agreement_events'),
       ('private','project_stage_owner_history'),
       ('public','project_execution_events'),
       ('public','inventory_movements'),
       ('public','inventory_transactions'),
       ('public','work_measurement_costs')
     ) THEN
    v_org:=nullif(to_jsonb(old)->>'organization_id','')::uuid;
    v_project:=nullif(to_jsonb(old)->>'project_id','')::uuid;
    v_contract:=nullif(to_jsonb(old)->>'contract_id','')::uuid;
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
