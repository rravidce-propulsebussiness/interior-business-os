\set ON_ERROR_STOP on
-- Run only against a fresh disposable CI database. No persistent deletions:
-- the entire integration exercise is ROLLED BACK.
BEGIN;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$
DECLARE
  org uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  preview jsonb; outcome jsonb; other_count bigint; member_count bigint;
BEGIN
  IF NOT private.owner_test_reset_allowed(org) THEN
    RAISE EXCEPTION 'FAIL: demo Owner is unauthorized for test reset'; END IF;
  preview:=public.owner_test_data_reset_preview(org);
  IF (preview->>'total')::bigint<1 THEN
    RAISE EXCEPTION 'FAIL: expected seeded operational test records'; END IF;
  RAISE NOTICE 'PASS: demo Owner sees tenant-scoped deletion preview';

  BEGIN
    PERFORM public.owner_test_data_reset_execute(org,'WRONG CONFIRMATION',preview->>'signature');
    RAISE EXCEPTION 'FAIL: incorrect typed phrase allowed';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'PASS: wrong typed confirmation rejected';
  END;

  SELECT count(*) INTO other_count FROM public.organizations WHERE id<>org;
  SELECT count(*) INTO member_count FROM public.organization_memberships WHERE organization_id=org;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
  BEGIN
    PERFORM public.owner_test_data_reset_execute(org,preview->>'required_phrase',preview->>'signature');
    RAISE EXCEPTION 'FAIL: non-owner was able to reset data';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS: other user cannot reset company test records';
  END;
  PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

  outcome:=public.owner_test_data_reset_execute(
    org,preview->>'required_phrase',preview->>'signature'
  );
  IF outcome->>'success' IS DISTINCT FROM 'true'
    OR (public.owner_test_data_reset_preview(org)->>'total')::bigint<>0 THEN
    RAISE EXCEPTION 'FAIL: transactional reset left operational data behind'; END IF;
  IF (SELECT count(*) FROM public.organizations WHERE id<>org)<>other_count
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=org)
    OR (SELECT count(*) FROM public.organization_memberships WHERE organization_id=org)<>member_count THEN
    RAISE EXCEPTION 'FAIL: reset damaged company, membership or other tenant'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE organization_id=org
     AND action='organization.test_data_reset') THEN
    RAISE EXCEPTION 'FAIL: reset omitted audit event'; END IF;
  RAISE NOTICE 'PASS: reset clears linked transactional data, keeps company and audit';
END;
$test$;
ROLLBACK;
