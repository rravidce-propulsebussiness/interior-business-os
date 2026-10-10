\set ON_ERROR_STOP on
begin;
create function private.marketplace_assert(ok boolean, label text) returns void language plpgsql as $fn$
begin
 if ok is distinct from true then raise exception 'FAILED: %',label;end if;
 raise notice 'PASS: %',label;
end $fn$;
create function private.marketplace_denied(command text,label text) returns void language plpgsql as $fn$
begin
 begin execute command;
 exception when sqlstate '42501' then raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $fn$;

create function private.marketplace_invalid(command text,label text) returns void language plpgsql as $fn$
begin
 begin execute command;
 exception when sqlstate '22023' then raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $fn$;

-- Isolated buyer company. The existing demo-interiors company is the seller.
insert into auth.users(id,email) values('66666666-6666-4666-8666-666666666666','market.buyer@example.test');
insert into public.organizations(id,name,slug,status,default_currency,country_code,default_timezone,created_by)
values('77777777-7777-4777-8777-777777777777','Retail Buyer','marketplace-buyer-demo','active','INR','IN','Asia/Kolkata','66666666-6666-4666-8666-666666666666');
insert into public.roles(id,organization_id,key,name,is_owner)
values('88888888-8888-4888-8888-888888888888','77777777-7777-4777-8777-777777777777','owner','Owner',true);
insert into public.role_permissions(organization_id,role_id,permission_id)
select '77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888',permission_id
from public.role_permissions where role_id=(select id from public.roles where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and is_owner);
insert into public.organization_memberships(id,organization_id,user_id,status)
values('99999999-9999-4999-8999-999999999999','77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666','active');
insert into public.membership_roles(organization_id,membership_id,role_id)
values('77777777-7777-4777-8777-777777777777','99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888');

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.marketplace_seller_apply('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Demo Supply House') as seller_id \gset
select private.marketplace_assert((public.marketplace_seller_profile('dddddddd-dddd-4ddd-8ddd-dddddddddddd')->>'status')='pending','seller application is pending');
select private.marketplace_denied(
 $$select public.marketplace_product_save('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{}')$$,
 'pending seller cannot publish');
select private.marketplace_denied($$select public.marketplace_sellers_review('all')$$,'tenant cannot review sellers');
select private.marketplace_denied($$select count(*) from private.marketplace_products$$,'private seller products not directly readable');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select private.marketplace_assert(jsonb_array_length(public.marketplace_sellers_review('pending'))>=1,'platform admin sees seller application');
select public.marketplace_seller_decide(:'seller_id','approve');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.marketplace_product_save(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 ('{"industryId":"' || (select id::text from public.industries where key='interior') || '","sku":"PLY-100","name":"Premium plywood","category":"Panels","unit":"sheet","price":1500.00,"minQuantity":2,"currency":"INR","status":"published"}')::jsonb
) as product_id \gset
select private.marketplace_assert(
 jsonb_array_length(public.marketplace_seller_profile('dddddddd-dddd-4ddd-8ddd-dddddddddddd')->'products')=1,
 'seller owns published listing');

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select private.marketplace_denied(
 $$select public.marketplace_catalog('dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
 'non-buyer role cannot browse private B2B catalog');

select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select private.marketplace_assert(
 jsonb_array_length(public.marketplace_catalog('77777777-7777-4777-8777-777777777777'))=1,
 'buyer sees approved supplier with posted price');
select private.marketplace_denied(
 $$select public.marketplace_seller_profile('dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
 'buyer cannot see seller private account');
select public.marketplace_order_place(
 '77777777-7777-4777-8777-777777777777',:'product_id',2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
) as order_id \gset
select private.marketplace_assert(
 (public.marketplace_orders('77777777-7777-4777-8777-777777777777','buyer')->0->>'total')::numeric=3000,
 'server calculates price snapshot');
select private.marketplace_assert(
 public.marketplace_order_place(
 '77777777-7777-4777-8777-777777777777',:'product_id',2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 )=:'order_id'::uuid, 'order request is idempotent');
select private.marketplace_denied(
 format('select public.marketplace_order_decide(%L,%L,%L)','77777777-7777-4777-8777-777777777777',:'order_id','accept'),
 'buyer cannot act as seller');
select private.marketplace_assert(
 jsonb_array_length(public.marketplace_orders('77777777-7777-4777-8777-777777777777','seller'))=0,
 'buyer cannot read seller inbox for another organization');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select private.marketplace_invalid(
 format('select public.marketplace_order_place(%L,%L,2,%L)','dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'product_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 'seller cannot purchase own product');
select public.marketplace_order_decide('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'order_id','accept');
select private.marketplace_assert(
 (public.marketplace_orders('dddddddd-dddd-4ddd-8ddd-dddddddddddd','seller')->0->>'status')='accepted',
 'seller accepts an incoming request');

-- New industries are data-driven, not hard-coded to construction.
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select private.marketplace_denied(
 $$select public.marketplace_industry_create('manufacturing','Manufacturing')$$,
 'ordinary buyer cannot add industries');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select public.marketplace_industry_create('manufacturing','Manufacturing') as new_industry_id \gset
select public.marketplace_seller_industry_assign('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'new_industry_id');
-- The platform user has no direct cross-tenant RLS SELECT privilege.
-- Assert fixture state as the disposable test owner, not by weakening RLS.
reset role;
select private.marketplace_assert(
 exists (select 1 from public.organization_industries where
 organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and industry_id=:'new_industry_id'),
 'platform can assign an added industry to seller');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.marketplace_product_save(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 ('{"industryId":"' || (select id from public.industries where key='manufacturing') || '","sku":"MFG-100","name":"Metal component","category":"Parts","unit":"piece","price":80,"minQuantity":10,"currency":"INR","status":"published"}')::jsonb
);
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select private.marketplace_assert(
 jsonb_array_length(public.marketplace_catalog(
 '77777777-7777-4777-8777-777777777777',
 (select id from public.industries where key='manufacturing')))=1,
 'new registered industry is immediately available in buyer catalog');
rollback;
