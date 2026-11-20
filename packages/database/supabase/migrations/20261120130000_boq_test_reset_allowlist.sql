-- Construction BOQ documents are tenant-scoped business records linked to
-- projects and quotation revisions. Add them to the owner-only test data reset
-- allowlist; otherwise the reset is blocked by the new dependent table.
-- Company BOQ rate cards are settings and are intentionally not reset.
--
-- The current allowlist is extended in place (order preserved, BOQ appended),
-- so this stays correct however many earlier allowlist migrations ran.
BEGIN;
DO $migration$
DECLARE entries text;
BEGIN
  IF 'public.construction_boq_documents'::regclass = ANY(private.test_reset_targets()) THEN
    RETURN;
  END IF;
  -- Schema-qualify explicitly: regclass::text omits schemas on the search path.
  SELECT string_agg(
           pg_catalog.quote_literal(pg_catalog.format('%I.%I', n.nspname, c.relname))
             || '::regclass',
           ',' ORDER BY t.ord)
    INTO entries
    FROM unnest(private.test_reset_targets() || 'public.construction_boq_documents'::regclass)
      WITH ORDINALITY AS t(target, ord)
    JOIN pg_catalog.pg_class c ON c.oid = t.target
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace;
  EXECUTE format(
    $def$CREATE OR REPLACE FUNCTION private.test_reset_targets()
 RETURNS regclass[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT ARRAY[%s]::regclass[] $function$$def$,
    entries
  );
END;
$migration$;
COMMIT;
