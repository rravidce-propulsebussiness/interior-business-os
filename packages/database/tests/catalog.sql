\set ON_ERROR_STOP on
begin;
create function private.catalog_assert(condition boolean,label text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'PASS: %',label; end $$;
create function private.catalog_denied(command text,states text[],label text) returns void language plpgsql as $$ begin begin execute command; exception when others then if sqlstate=any(states) then raise notice 'PASS: %',label;return;end if;raise exception 'FAILED: % (%: %)',label,sqlstate,sqlerrm;end;raise exception 'FAILED: % (allowed)',label;end $$;
select id as owner from public.profiles where id='11111111-1111-4111-8111-111111111111' \gset
\set org 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
select id as wardrobe from public.catalog_items where organization_id=:'org' and key='wardrobe' \gset
select id as tv from public.catalog_items where organization_id=:'org' and key='tv_unit' \gset
select id as rate from public.price_book_items where item_id=:'wardrobe' \gset
select id as finish from public.catalog_item_attributes where item_id=:'wardrobe' and key='finish' \gset
select id as pu from public.catalog_attribute_options where attribute_id=:'finish' and key='pu' \gset
select id as dependent from public.catalog_item_attributes where item_id=:'wardrobe' and key='pu_finish' \gset
insert into auth.users(id,email) values('66666666-6666-4666-8666-666666666666','phase2.other@example.test');
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select public.create_organization('{"name":"Other Catalog","slug":"phase2-other","currency":"INR","country":"IN","timezone":"UTC"}') as other_org \gset
insert into public.organization_entitlements(organization_id,module_id,enabled,source) select :'other_org',id,true,'manual' from public.modules where key='pricing';
select public.save_branch(:'other_org','{"name":"Other branch","code":"other"}') as other_branch \gset
select public.save_catalog_entity(:'other_org','catalog_categories','{"name":"Other category","key":"other"}') as other_category \gset
select public.save_catalog_entity(:'other_org','catalog_items','{"name":"Other item","key":"other","unit_key":"each","method_key":"count"}') as other_item \gset
select public.save_catalog_entity(:'other_org','price_books','{"name":"Other book","key":"other","currency":"INR","valid_from":"2026-01-01T00:00:00Z"}') as other_book \gset
select public.save_catalog_entity(:'other_org','catalog_item_attributes',jsonb_build_object('item_id',:'other_item','key','other','label','Other','input_type','select','affects_pricing',true)) as other_attribute \gset
select public.save_catalog_entity(:'other_org','catalog_attribute_options',jsonb_build_object('item_id',:'other_item','attribute_id',:'other_attribute','key','other','label','Other')) as other_option \gset
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner',true);
select private.catalog_assert((select count(*)=7 from public.catalog_items),'demo contains seven items');
select private.catalog_assert((select count(*)=5 from public.catalog_categories),'demo contains five categories');
select private.catalog_assert(jsonb_array_length(public.catalog_snapshot(:'org',true)->'items')=7,'snapshot returns authorized catalog');
select private.catalog_denied(format('select public.catalog_snapshot(%L,true)',:'other_org'),array['42501'],'foreign catalog pricing snapshot denied');
select private.catalog_assert((select count(*)=0 from public.catalog_items where organization_id=:'other_org'),'cross tenant catalog read denied');
select private.catalog_assert((select count(*)=0 from public.price_books where organization_id=:'other_org'),'cross tenant price book read denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_books'',''{"name":"Attack","key":"attack","currency":"INR","valid_from":"2026-01-01T00:00:00Z"}'')',:'other_org'),array['42501'],'cross tenant price book mutation denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_items'',%L)',:'org',jsonb_build_object('name','Bad','key','bad_category','category_id',:'other_category','unit_key','each','method_key','count')),array['23503'],'foreign category reference denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''pricing_modifiers'',%L)',:'org',jsonb_build_object('item_id',:'wardrobe','option_id',:'other_option','label','Bad','kind','fixed','value','1')),array['23503'],'foreign option reference denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''pricing_modifiers'',%L)',:'org',jsonb_build_object('item_id',:'tv','option_id',:'pu','label','Wrong item','kind','fixed','value','1')),array['23503'],'same tenant cross-item option denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_attribute_options'',%L)',:'org',jsonb_build_object('item_id',:'wardrobe','attribute_id',:'other_attribute','label','Bad','key','bad')),array['23503'],'foreign attribute reference denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_book_items'',%L)',:'org',jsonb_build_object('item_id',:'wardrobe','price_book_id',:'other_book','base_rate','1','currency','INR','valid_from','2026-01-01T00:00:00Z')),array['23503'],'foreign book rate reference denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_books'',%L)',:'org',jsonb_build_object('name','Bad','key','bad_branch','branch_id',:'other_branch','currency','INR','valid_from','2026-01-01T00:00:00Z')),array['23503'],'foreign branch book denied');
select private.catalog_denied('update public.catalog_items set name=''Attack''',array['42501'],'direct catalog update denied');
select private.catalog_denied('delete from public.price_book_items',array['42501'],'direct historical rate deletion denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''organizations'',''{}'')',:'org'),array['22023'],'RPC entity injection denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_items'',%L)',:'org',jsonb_build_object('id',:'wardrobe','version',1,'created_at','2000-01-01')),array['22023'],'system field injection denied');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_items'',''{"name":"Bad unit","key":"bad_unit","unit_key":"each","method_key":"volume"}'')',:'org'),array['22023'],'incompatible measurement rejected');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_book_items'',%L)',:'org',jsonb_build_object('item_id',:'wardrobe','base_rate','NaN','currency','INR','valid_from','2026-01-01T00:00:00Z')),array['23514'],'non-finite monetary value rejected');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_book_items'',%L)',:'org',jsonb_build_object('item_id',:'wardrobe','base_rate','100','currency','INR','valid_from','2026-10-01T00:00:00Z','valid_until','2026-09-01T00:00:00Z')),array['23514'],'reversed rate interval rejected');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''pricing_modifiers'',%L)',:'org',jsonb_build_object('item_id',:'wardrobe','label','Bad percentage','kind','percentage','value','-101')),array['23514'],'invalid modifier percentage rejected');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_book_items'',%L)',:'org',jsonb_build_object('item_id',:'wardrobe','base_rate','1650','currency','INR','valid_from','2026-01-01T00:00:00Z')),array['23514'],'overlapping active rate rejected');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_books'',''{"name":"Duplicate default","key":"duplicate_default","currency":"INR","is_default":true,"valid_from":"2026-01-01T00:00:00Z"}'')',:'org'),array['23505'],'ambiguous default book rejected');
select public.save_catalog_entity(:'org','catalog_categories','{"name":"Parent","key":"test_parent"}') as parent_category \gset
select public.save_catalog_entity(:'org','catalog_categories',jsonb_build_object('name','Child','key','test_child','parent_id',:'parent_category')) as child_category \gset
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_categories'',%L)',:'org',jsonb_build_object('id',:'parent_category','version',1,'parent_id',:'child_category')),array['22023'],'category cycle rejected');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_item_attributes'',%L)',:'org',jsonb_build_object('id',:'finish','version',1,'conditions',jsonb_build_array(jsonb_build_object('attribute_key','pu_finish','operator','equals','values',jsonb_build_array('matte'))))),array['22023'],'dependency cycle rejected');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_item_attributes'',%L)',:'org',jsonb_build_object('id',:'dependent','version',1,'conditions',jsonb_build_array(jsonb_build_object('attribute_key','finish','operator','equals','values',jsonb_build_array('foreign'))))),array['22023'],'foreign dependency option rejected');
select public.save_catalog_entity(:'org','catalog_items',jsonb_build_object('id',:'wardrobe','version',1,'name','Wardrobe updated'));
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_items'',%L)',:'org',jsonb_build_object('id',:'wardrobe','version',1,'name','Stale')),array['40001'],'stale item edit rejected');
select private.catalog_assert((select version=2 and name='Wardrobe updated' from public.catalog_items where id=:'wardrobe'),'item version increments');
select public.save_catalog_entity(:'org','price_book_items',jsonb_build_object('item_id',:'wardrobe','base_rate','1650','minimum_rate','1400','currency','INR','valid_from','2026-10-01T00:00:00Z'),:'rate',1) as new_rate \gset
select private.catalog_assert((select base_rate='1550' and valid_until='2026-10-01T00:00:00Z' and version=2 from public.price_book_items where id=:'rate'),'old rate values preserved and window closed');
select private.catalog_assert((select base_rate='1650' from public.price_book_items where id=:'new_rate'),'new rate revision created');
select public.set_rate_status(:'org',:'new_rate',1,'inactive');
select private.catalog_assert((select status='inactive' and base_rate='1650' from public.price_book_items where id=:'new_rate'),'deactivation preserves rate history');
select private.catalog_denied(format('select public.set_rate_status(%L,%L,1,''active'')',:'org',:'new_rate'),array['40001'],'stale rate status change rejected');
select public.set_rate_status(:'org',:'new_rate',2,'active');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_book_items'',%L,%L,1)',:'org',jsonb_build_object('item_id',:'wardrobe','base_rate','1750','currency','INR','valid_from','2026-11-01T00:00:00Z'),:'rate'),array['40001'],'stale rate replacement rejected');
select private.catalog_assert(exists(select 1 from public.audit_logs where entity_type='price_book_items' and metadata->'before'->>'base_rate'='1550' and metadata->'after'->>'valid_until' is not null),'rate before/after audit recorded');
select private.catalog_assert((select count(*)=1 from public.pricing_costs),'authorized Owner reads internal cost');

-- Least-privilege reader can price but cannot edit or read cost, even via direct tables/audit.
select public.save_role(:'org','{"key":"price_reader","name":"Price reader","permissions":["catalog.view","pricing.view","organization.audit"]}') as reader_role \gset
select public.set_member_role(:'org',(select id from public.organization_memberships where organization_id=:'org' and user_id='22222222-2222-4222-8222-222222222222'),:'reader_role');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select private.catalog_assert((select count(*)>0 from public.price_book_items),'pricing.view reads selling rates');
select private.catalog_assert((select count(*)=0 from public.pricing_costs),'internal cost read denied without cost permission');
select private.catalog_assert(jsonb_array_length(public.catalog_snapshot(:'org',true)->'costs')=0,'snapshot excludes unauthorized internal costs');
select private.catalog_assert((select count(*)=0 from public.audit_logs where entity_type='pricing_costs'),'cost audit does not leak internal cost');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_categories'',''{"name":"No","key":"denied"}'')',:'org'),array['42501'],'catalog.manage required');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_books'',''{"name":"No","key":"denied"}'')',:'org'),array['42501'],'pricing.manage required');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select private.catalog_assert((select count(*)>0 from public.catalog_items),'catalog.view reads catalog');
select private.catalog_assert((select count(*)=0 from public.price_book_items),'pricing.view required for selling rates');
select private.catalog_denied(format('select public.catalog_snapshot(%L,true)',:'org'),array['42501'],'pricing snapshot requires pricing.view');
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select private.catalog_assert((select count(*)=0 from public.catalog_items),'catalog.view required for item reads');
reset role;
update public.organization_memberships set status='suspended' where organization_id=:'org' and user_id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select private.catalog_assert((select count(*)=0 from public.catalog_items),'suspended member cannot read catalog');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_categories'',''{"name":"No","key":"suspended"}'')',:'org'),array['42501'],'suspended member cannot mutate');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select private.catalog_assert((select count(*)=0 from public.catalog_items),'platform administrator has no tenant catalog access');
select public.platform_set_entitlement(:'org','{"moduleKey":"pricing","enabled":false,"source":"manual"}');
select set_config('request.jwt.claim.sub',:'owner',true);
select private.catalog_assert((select count(*)=0 from public.price_book_items),'disabled pricing entitlement blocks direct reads');
select private.catalog_denied(format('select public.catalog_snapshot(%L,true)',:'org'),array['42501'],'disabled pricing entitlement blocks calculation snapshot');
select private.catalog_assert((select count(*)=0 from public.audit_logs where entity_type in ('price_book_items','pricing_modifiers','pricing_costs')),'disabled pricing cannot leak through audit metadata');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''price_books'',''{"name":"No","key":"disabled"}'')',:'org'),array['42501'],'disabled pricing entitlement blocks RPC writes');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select public.platform_set_entitlement(:'org','{"moduleKey":"catalog","enabled":false,"source":"manual"}');
select set_config('request.jwt.claim.sub',:'owner',true);
select private.catalog_assert((select count(*)=0 from public.catalog_items),'disabled catalog entitlement blocks direct reads');
select private.catalog_denied(format('select public.save_catalog_entity(%L,''catalog_categories'',''{"name":"No","key":"disabled"}'')',:'org'),array['42501'],'disabled catalog entitlement blocks RPC writes');
reset role;
select private.catalog_assert(not has_function_privilege('anon','public.save_catalog_entity(uuid,text,jsonb,uuid,integer)','EXECUTE'),'anonymous mutation RPC denied');
select private.catalog_assert(not has_function_privilege('authenticated','private.validate_catalog(uuid)','EXECUTE'),'private validator not exposed');
select private.catalog_assert((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),'all new and existing tables force RLS');
rollback;
\echo Phase 2 catalog assertions passed; fixtures rolled back.
