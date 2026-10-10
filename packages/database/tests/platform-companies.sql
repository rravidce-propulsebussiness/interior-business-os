\set ON_ERROR_STOP on
begin;
create function private.company_control_assert(ok boolean,label text)
returns void language plpgsql as $fn$
begin
 if ok is distinct from true then raise exception 'FAILED: %',label;end if;
 raise notice 'PASS: %',label;
end $fn$;
create function private.company_control_denied(command text,label text)
returns void language plpgsql as $fn$
begin
 begin execute command;
 exception when sqlstate '42501' then raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $fn$;
create function private.company_control_invalid(command text,label text)
returns void language plpgsql as $fn$
begin
 begin execute command;
 exception when others then raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $fn$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select private.company_control_denied(
 $$select public.platform_company_directory()$$,
 'ordinary tenant cannot view company directory');
select private.company_control_denied(
 $$select public.platform_company_create('{"name":"Bad User Co"}')$$,
 'ordinary tenant cannot create companies');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select private.company_control_assert(
 jsonb_typeof(public.platform_company_directory()->'rows')='array',
 'platform can browse organizations');
select private.company_control_invalid(
 $$select public.platform_company_create('{"name":"Fake Business","slug":"fake-business","ownerEmail":"not-in-auth@example.test","industries":["interior"],"country":"IN","currency":"INR","timezone":"Asia/Kolkata","seller":false}')$$,
 'platform cannot fabricate unverified Auth owners');

select public.platform_company_create(
 '{"name":"Universal Supplier","slug":"universal-supplier","ownerEmail":"owner@example.test","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["interior","construction"],"seller":true,"storeName":"Universal Wholesale"}'
) as new_company \gset
select private.company_control_assert(
 (public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)->'seller'->>'status')='approved',
 'seller storefront is created and approved for verified owner');
select private.company_control_assert(
 jsonb_array_length(public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)->'industries')=2,
 'company has two active industries');
select private.company_control_assert(
 jsonb_array_length(public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)->'roles')>1,
 'company is provisioned with canonical role templates');
select private.company_control_assert(
 (public.platform_company_directory(null,null,null,'seller',1)->>'total')::int>=1,
 'seller filter includes approved supplier');
select private.company_control_assert(
 (public.platform_company_directory(null,null,(select id from public.industries where key='construction'),'seller',1)->>'total')::int>=1,
 'industry filters select companies correctly');

select public.platform_company_industry_set(
 (:'new_company'::jsonb->>'organizationId')::uuid,
 (select id from public.industries where key='construction'),false);
select private.company_control_assert(
 jsonb_array_length(public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)->'industries')=1,
 'platform can remove unused industry');
select private.company_control_invalid(
 format('select public.platform_company_industry_set(%L::uuid,%L::uuid,false)',
 (:'new_company'::jsonb->>'organizationId'),
 (select id from public.industries where key='interior')),
 'platform cannot remove the final company industry');

select (public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)
 ->'members'->0->>'id') as member_id \gset
select (public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)
 ->'roles'->0->>'id') as owner_role \gset
select (public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)
 ->'roles'->1->>'id') as another_role \gset
select public.platform_company_role_set(
 (:'new_company'::jsonb->>'organizationId')::uuid,:'member_id',:'another_role',false);
select private.company_control_assert(
 jsonb_array_length((public.platform_company_profile((:'new_company'::jsonb->>'organizationId')::uuid)->'members'->0->'roleIds'))=2,
 'platform can assign a tenant role to a verified member');
select private.company_control_invalid(
 format('select public.platform_company_role_set(%L::uuid,%L::uuid,%L::uuid,true)',
 (:'new_company'::jsonb->>'organizationId'),:'member_id',:'owner_role'),
 'cannot remove last owner role');
select private.company_control_denied(
 format('select public.platform_company_role_set(%L::uuid,%L::uuid,%L::uuid,false)',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'member_id',:'another_role'),
 'cannot assign role from different tenant');

select public.platform_company_create(
 '{"name":"Regular Buyer","slug":"regular-buyer","ownerEmail":"owner@example.test","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["interior"],"seller":false}'
) as buyer_company \gset
select private.company_control_assert(
 (public.platform_company_profile((:'buyer_company'::jsonb->>'organizationId')::uuid)->'seller') is null,
 'new business starts without seller account');
select public.platform_company_seller_enable((:'buyer_company'::jsonb->>'organizationId')::uuid,'Buyer Wholesale');
select private.company_control_assert(
 (public.platform_company_profile((:'buyer_company'::jsonb->>'organizationId')::uuid)->'seller'->>'status')='approved',
 'platform can activate seller on existing business');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select private.company_control_denied(
 format('select public.platform_company_profile(%L::uuid)',(:'new_company'::jsonb->>'organizationId')),
 'company member cannot access platform-only details');
rollback;
