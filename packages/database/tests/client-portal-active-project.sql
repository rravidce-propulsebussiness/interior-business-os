\set ON_ERROR_STOP on
-- Disposable fixture regression. Sharing an active real project is distinct
-- from the stricter authorization required to start site execution.
begin;
do $test$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;
begin
 select id into project from public.projects
  where organization_id=org and code='demo-3bhk';
 if project is null then raise exception 'Missing demo active client project';end if;
 if not private.client_portal_eligible(org,project) then
  raise exception 'FAIL: active client project blocked by redundant execution gate';
 end if;
 if private.client_portal_eligible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,project) then
  raise exception 'FAIL: project eligible under the wrong organization';
 end if;
 update public.projects set removed_from_workspace=true where id=project;
 if private.client_portal_eligible(org,project) then
  raise exception 'FAIL: removed project remains shareable';
 end if;
 raise notice 'PASS: active client project can be shared, cross-tenant and removed projects cannot';
end
$test$;
rollback;
