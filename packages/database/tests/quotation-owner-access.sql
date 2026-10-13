\set ON_ERROR_STOP on
begin;

create function pg_temp.quote_owner_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;

-- Existing roles must receive the same quotation dependencies as new owners.
select pg_temp.quote_owner_assert(
  not exists (
    select 1
    from public.roles r
    join public.permissions p on p.scope = 'organization'
      and p.key in (
        'quotation.create','quotation.view','customer.create','customer.view',
        'project.create','project.view','settings.manage'
      )
    where r.is_owner
      and not exists (
        select 1 from public.role_permissions rp
        where rp.organization_id = r.organization_id
          and rp.role_id = r.id and rp.permission_id = p.id
      )
  ),
  'existing organization owners have all quote-creation permissions'
);

-- The fixed test organization is available in the database test fixtures.
-- Build a quotation-only plan for a deterministic dependency test.
insert into public.plans(key,name,status)
values('quote-owner-dependency-test','Quote Only Dependency Test','active');
insert into public.plan_modules(plan_id,module_id)
select p.id, m.id
from public.plans p, public.modules m
where p.key = 'quote-owner-dependency-test' and m.key = 'quotation';
delete from public.organization_entitlements
where organization_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
update public.organizations
set plan_id = (select id from public.plans where key = 'quote-owner-dependency-test')
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

select pg_temp.quote_owner_assert(
  private.entitled('dddddddd-dddd-4ddd-8ddd-dddddddddddd','quotation')
  and private.entitled('dddddddd-dddd-4ddd-8ddd-dddddddddddd','projects')
  and not private.entitled('dddddddd-dddd-4ddd-8ddd-dddddddddddd','crm'),
  'quotation subscription includes project workspace but not unrelated CRM'
);

insert into public.organization_entitlements(
  organization_id,module_id,enabled,source
)
select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', m.id, false, 'manual'
from public.modules m where m.key = 'projects';

select pg_temp.quote_owner_assert(
  private.entitled('dddddddd-dddd-4ddd-8ddd-dddddddddddd','quotation')
  and not private.entitled('dddddddd-dddd-4ddd-8ddd-dddddddddddd','projects'),
  'explicit project disable still blocks the dependency'
);

rollback;
