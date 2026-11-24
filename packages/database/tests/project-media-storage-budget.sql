\set ON_ERROR_STOP on
begin;
-- Photo uploads are limited by a per-project storage budget, not by 150 files.
do $$
declare definition text := pg_get_functiondef(
  'public.project_site_media_put(uuid,uuid,text,text,text,text,text)'::regprocedure);
begin
 if position('Project media count limit reached' in definition) > 0 then
   raise exception 'FAIL: project photos are still capped at 150';end if;
 if position('786432000' in definition) = 0 or position('>=1500' in definition) = 0 then
   raise exception 'FAIL: project photo storage budget missing';end if;
 if position('Reuse an existing project photo' in definition) = 0 then
   raise exception 'FAIL: storage message does not say what to do';end if;
 raise notice 'PASS: project photos use a storage budget';
end$$;
rollback;
