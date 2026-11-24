\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; project uuid;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 perform set_config('test.discard_project',project::text,true);
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
end$$;
reset role;
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.discard_project')::uuid; m uuid; k text;
begin
 foreach k in array array['fresh','other','old','linked'] loop
  insert into private.site_media(organization_id,project_id,filename,mime,bytes,category,caption,uploaded_by,created_at)
  values(org,project,k||'.png','image/png',decode('89504e470d0a1a0a','hex'),'inspection','QC photo',
   case when k='other' then '22222222-2222-4222-8222-222222222222'::uuid
        else '11111111-1111-4111-8111-111111111111'::uuid end,
   case when k='old' then now()-interval '1 hour' else now() end)
  returning id into m;
  perform set_config('test.discard_'||k,m::text,true);
 end loop;
 insert into private.site_checks(organization_id,project_id,title,created_by,photo_id)
 values(org,project,'Linked check','11111111-1111-4111-8111-111111111111',
   current_setting('test.discard_linked')::uuid);
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.discard_project')::uuid; r jsonb; k text;
begin
 r=public.project_site_media_discard(org,project,current_setting('test.discard_fresh')::uuid);
 if (r->>'discarded')::boolean is not true then
   raise exception 'FAIL: own fresh unreferenced photo was not discarded: %',r;end if;
 foreach k in array array['other','old','linked'] loop
  r=public.project_site_media_discard(org,project,current_setting('test.discard_'||k)::uuid);
  if (r->>'discarded')::boolean then raise exception 'FAIL: % photo was discarded',k;end if;
 end loop;
 raise notice 'PASS: only fresh, unreferenced own uploads are discarded';
end$$;
reset role;
do $$
begin
 if exists(select 1 from private.site_media where id=current_setting('test.discard_fresh')::uuid) then
  raise exception 'FAIL: discarded photo still stored';end if;
 if (select count(*) from private.site_media where id in (
   current_setting('test.discard_other')::uuid,current_setting('test.discard_old')::uuid,
   current_setting('test.discard_linked')::uuid))<>3 then
  raise exception 'FAIL: protected photos were removed';end if;
 raise notice 'PASS: protected photos remain';
end$$;
rollback;
