\set ON_ERROR_STOP on
-- Disposable integration exercise: all payments and receipts ROLLED BACK.
BEGIN;
\ir site-agreement-quotation-fixture.sql
SET LOCAL ROLE authenticated;
\ir site-agreement-helper.sql
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $setup$
DECLARE
 org uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;contract uuid;item uuid;request uuid;proof uuid:=gen_random_uuid();
 account uuid;amount text;
BEGIN
 SELECT id INTO project FROM public.projects
 WHERE organization_id=org AND code='demo-3bhk';
 PERFORM public.project_site_command(org,project,'initialize','{}'::jsonb);
 contract:=pg_temp.site_signed_agreement(org,project);
 SELECT id,expected_amount INTO item,amount FROM public.payment_schedule_items
 WHERE organization_id=org AND contract_id=contract LIMIT 1;
 request:=public.payment_request_issue(org,item);
 SELECT id INTO account FROM public.payment_methods
 WHERE organization_id=org AND kind='bank_transfer' AND active LIMIT 1;
 IF account IS NULL OR request IS NULL THEN
  RAISE EXCEPTION 'Fixture missing payment method / request'; END IF;
 PERFORM set_config('test.client_proof_id',proof::text,true);
 PERFORM set_config('test.client_proof_contract',contract::text,true);
 PERFORM set_config('test.client_proof_method',account::text,true);
 PERFORM set_config('test.client_proof_amount',amount,true);
 -- Only a truly invited client can call this preflight.
 BEGIN
   PERFORM public.client_payment_proof_prepare(project,request,100,
    'TEST-UNAUTH-REF');
   RAISE EXCEPTION 'FAIL: uninvited customer accessed payment proof';
 EXCEPTION WHEN insufficient_privilege THEN
   RAISE NOTICE 'PASS: unauthorized customer upload denied';
 END;
END;$setup$;
RESET ROLE;
DO $seed$
DECLARE
 org uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;contract uuid;request uuid;proof uuid;
BEGIN
 SELECT id INTO project FROM public.projects
 WHERE organization_id=org AND code='demo-3bhk';
 contract:=current_setting('test.client_proof_contract')::uuid;
 proof:=current_setting('test.client_proof_id')::uuid;
 SELECT id INTO request FROM public.payment_requests
 WHERE organization_id=org AND contract_id=contract LIMIT 1;
 INSERT INTO private.client_payment_proofs(id,organization_id,project_id,
   contract_id,request_id,submitted_by,amount,bank_reference,method,
   object_key,mime,byte_size)
 VALUES(proof,org,project,contract,request,
  '11111111-1111-4111-8111-111111111111',
  current_setting('test.client_proof_amount'),'TEST-BANK-REF-000001',
  'bank_transfer',
  'payment-proof/'||org||'/'||project||'/'||proof,
  'image/png',1024);
END;$seed$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $verify$
DECLARE
 org uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 contract uuid:=current_setting('test.client_proof_contract')::uuid;
 proof uuid:=current_setting('test.client_proof_id')::uuid;
 method uuid:=current_setting('test.client_proof_method')::uuid;
 result jsonb;second jsonb; paid bigint; receipts bigint;
BEGIN
 BEGIN
  PERFORM public.staff_payment_proof_decide(org,proof,'approve',method,false);
  RAISE EXCEPTION 'FAIL: bank credit was not confirmed';
 EXCEPTION WHEN invalid_parameter_value THEN
  RAISE NOTICE 'PASS: review requires verified bank credit';END;
 result:=public.staff_payment_proof_decide(org,proof,'approve',method,true);
 IF result->>'status'<>'approved' OR result->>'receiptId' IS NULL THEN
  RAISE EXCEPTION 'FAIL: verified payment did not create official receipt'; END IF;
 second:=public.staff_payment_proof_decide(org,proof,'approve',method,true);
 IF second->>'paymentId' IS DISTINCT FROM result->>'paymentId' THEN
  RAISE EXCEPTION 'FAIL: retry created a different payment';END IF;
 SELECT count(*) INTO paid FROM public.payments WHERE organization_id=org
  AND contract_id=contract AND status='recorded'
  AND external_reference='TEST-BANK-REF-000001';
 SELECT count(*) INTO receipts FROM public.receipts
  WHERE organization_id=org AND payment_id=(result->>'paymentId')::uuid
   AND status='issued';
 IF paid<>1 OR receipts<>1 THEN
  RAISE EXCEPTION 'FAIL: expected exactly 1 payment and 1 receipt';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(
    public.staff_payment_proof_list(org,contract)) p
  WHERE p->>'id'=proof::text AND p->>'status'='approved'
   AND p->>'paymentId'=result->>'paymentId'
   AND p->>'receiptId'=result->>'receiptId') THEN
  RAISE EXCEPTION 'FAIL: review projection not linked to canonical ledger';END IF;
 RAISE NOTICE 'PASS: bank-verified approval creates one payment and one receipt, retry idempotent';
END;$verify$;
ROLLBACK;
