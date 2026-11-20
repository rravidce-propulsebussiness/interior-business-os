-- Historical duplicate of 20261119182359_meta_lead_brochure_automation.sql.
-- Keep this migration version as an explicit no-op instead of deleting it:
-- earlier migrations already create the fields and constraints, and the
-- 20261119182405 carousel migration strengthens the automation check.
-- Re-applying the original statements failed on a fresh database and could
-- unintentionally replace the carousel validation if made idempotent.
begin;
commit;
