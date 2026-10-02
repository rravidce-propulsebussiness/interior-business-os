\set ON_ERROR_STOP on
-- Disposable harness users only: no passwords and no authentication server simulation.
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','owner@example.test'),
 ('22222222-2222-4222-8222-222222222222','sales@example.test'),
 ('33333333-3333-4333-8333-333333333333','designer@example.test'),
 ('44444444-4444-4444-8444-444444444444','accountant@example.test'),
 ('55555555-5555-4555-8555-555555555555','platform.admin@example.test') on conflict(id) do nothing;
\ir ../supabase/seed-users.sql
\ir ../supabase/seed-users.sql
do $$ begin
 if (select count(*) from public.organizations where slug='demo-interiors')<>1 then raise exception 'Demo organization not deterministic'; end if;
 if (select count(*) from public.organization_memberships where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>4 then raise exception 'Demo membership count'; end if;
 if (select count(*) from public.roles where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>10 then raise exception 'Demo role count'; end if;
 if (select count(*) from public.branches where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>1 then raise exception 'Demo branch count'; end if;
 if (select count(*) from public.platform_user_roles where user_id='55555555-5555-4555-8555-555555555555')<>1 then raise exception 'Platform role seed'; end if;
 raise notice 'PASS: demo users, organization, branches, roles and platform assignment are repeatable';
end $$;
