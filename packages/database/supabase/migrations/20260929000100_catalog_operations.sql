begin;
create function private.validate_catalog(org uuid) returns void language plpgsql security definer set search_path='' as $$
declare attr record; c jsonb; parent_attribute public.catalog_item_attributes; v text;
begin
 if exists(with recursive walk as (
  select id,parent_id,array[id] path,false cycle from public.catalog_categories where organization_id=org
  union all select w.id,p.parent_id,w.path||p.id,p.id=any(w.path) from walk w join public.catalog_categories p on p.id=w.parent_id where not w.cycle
 ) select 1 from walk where cycle) then raise exception 'Category cycle' using errcode='22023'; end if;
 if exists(select 1 from public.catalog_items i join public.units u on u.key=i.unit_key join public.measurement_methods m on m.key=i.method_key where i.organization_id=org and m.key<>'manual' and m.dimension<>u.dimension) then raise exception 'Incompatible unit' using errcode='22023'; end if;
 for attr in select * from public.catalog_item_attributes where organization_id=org loop
  if (attr.input_type not in ('select','multi_select') and jsonb_array_length(attr.default_options)>0) or (attr.input_type='select' and jsonb_array_length(attr.default_options)>1) then raise exception 'Invalid defaults' using errcode='22023'; end if;
  if (select count(distinct value) from jsonb_array_elements_text(attr.default_options))<>jsonb_array_length(attr.default_options) then raise exception 'Duplicate defaults' using errcode='22023'; end if;
  for v in select jsonb_array_elements_text(attr.default_options) loop
   if not exists(select 1 from public.catalog_attribute_options o where o.attribute_id=attr.id and o.key=v and o.status='active') then raise exception 'Invalid default option' using errcode='22023'; end if;
  end loop;
  for c in select jsonb_array_elements(attr.conditions) loop
   if jsonb_typeof(c)<>'object' or coalesce(c->>'operator','') not in ('equals','not_equals','in','not_in') or jsonb_typeof(c->'values') is distinct from 'array' then raise exception 'Invalid condition' using errcode='22023'; end if;
   if jsonb_array_length(c->'values') not between 1 and 100 or ((c->>'operator') in ('equals','not_equals') and jsonb_array_length(c->'values')<>1) then raise exception 'Invalid condition values' using errcode='22023'; end if;
   select * into parent_attribute from public.catalog_item_attributes where item_id=attr.item_id and key=c->>'attribute_key';
   if not found or parent_attribute.input_type not in ('select','multi_select') then raise exception 'Invalid dependency parent' using errcode='22023'; end if;
   for v in select jsonb_array_elements_text(c->'values') loop
    if not exists(select 1 from public.catalog_attribute_options where attribute_id=parent_attribute.id and key=v) then raise exception 'Invalid dependency option' using errcode='22023'; end if;
   end loop;
  end loop;
 end loop;
 if exists(with recursive edges as (
  select a.id,p.id parent from public.catalog_item_attributes a cross join lateral jsonb_array_elements(a.conditions) condition_data join public.catalog_item_attributes p on p.item_id=a.item_id and p.key=condition_data->>'attribute_key' where a.organization_id=org
 ), walk as (select id,parent,array[id] path,parent=id cycle from edges union all select w.id,e.parent,w.path||w.parent,e.parent=any(w.path||w.parent) from walk w join edges e on e.id=w.parent where not w.cycle)
 select 1 from walk where cycle) then raise exception 'Dependency cycle' using errcode='22023'; end if;
 if exists(select 1 from public.price_book_items a join public.price_book_items b on a.organization_id=b.organization_id and a.item_id=b.item_id and a.price_book_id is not distinct from b.price_book_id and a.currency=b.currency and a.id<b.id where a.organization_id=org and a.status='active' and b.status='active' and tstzrange(a.valid_from,a.valid_until,'[)') && tstzrange(b.valid_from,b.valid_until,'[)')) then raise exception 'Overlapping rates' using errcode='23514'; end if;
 if exists(select 1 from public.price_book_items r join public.price_books b on b.id=r.price_book_id where r.organization_id=org and r.currency<>b.currency) then raise exception 'Currency mismatch' using errcode='22023'; end if;
 if exists(select 1 from public.pricing_modifiers m join public.catalog_attribute_options o on o.id=m.option_id join public.catalog_item_attributes a on a.id=o.attribute_id where m.organization_id=org and not a.affects_pricing) then raise exception 'Attribute must affect pricing' using errcode='22023'; end if;
end $$;

create function private.audit_catalog() returns trigger language plpgsql security definer set search_path='' as $$
declare before_data jsonb; after_data jsonb; fields text[];
begin
 fields=array['id','version','status','key','item_id','attribute_id','parent_id','category_id','unit_key','method_key','input_type','required','visible_sales','visible_customer','affects_pricing','conditions','default_options','sort_order','price_book_id','branch_id','currency','is_default','base_rate','minimum_rate','kind','value','option_id','rate_id','estimated_cost_rate','valid_from','valid_until','quantity_rounding','amount_rounding'];
 select jsonb_object_agg(key,value) into before_data from jsonb_each(to_jsonb(old)) where key=any(fields);
 select jsonb_object_agg(key,value) into after_data from jsonb_each(to_jsonb(new)) where key=any(fields);
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata) values(auth.uid(),new.organization_id,tg_table_name||'.'||lower(tg_op),tg_table_name,new.id::text,jsonb_build_object('before',before_data,'after',after_data));
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['catalog_categories','catalog_items','catalog_item_attributes','catalog_attribute_options','price_books','price_book_items','pricing_modifiers','pricing_costs'] loop
 execute format('create trigger audit_catalog after insert or update on public.%I for each row execute function private.audit_catalog()',t);
 end loop;
end $$;
drop policy audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using(
 ((organization_id is not null and private.has_permission(organization_id,'organization.audit')) or (organization_id is null and private.has_platform_permission('platform.audit.view')))
 and (entity_type<>'pricing_costs' or (private.has_permission(organization_id,'quotation.view_internal_cost') and public.has_entitlement(organization_id,'pricing'))));

-- The entity and writable columns are checked against a closed allowlist and actual catalog.
create function public.save_catalog_entity(p_organization_id uuid,p_entity text,p_input jsonb,p_replace_id uuid default null,p_replace_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; existing jsonb; columns_sql text; assignments text; key_name text; expected integer; pricing boolean; previous public.price_book_items;
begin
 if p_entity not in ('catalog_categories','catalog_items','catalog_item_attributes','catalog_attribute_options','price_books','price_book_items','pricing_modifiers','pricing_costs') then raise exception 'Invalid entity' using errcode='22023'; end if;
 pricing=p_entity in ('price_books','price_book_items','pricing_modifiers','pricing_costs');
 perform private.require_permission(p_organization_id,case when pricing then 'pricing.manage' else 'catalog.manage' end);
 if not private.has_permission(p_organization_id,'catalog.view') or not private.entitled(p_organization_id,'catalog') or (pricing and (not private.has_permission(p_organization_id,'pricing.view') or not private.entitled(p_organization_id,'pricing'))) or (p_entity='pricing_costs' and not private.has_permission(p_organization_id,'quotation.view_internal_cost')) then raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>32768 then raise exception 'Invalid input' using errcode='22023'; end if;
 if p_input ? 'organization_id' and p_input->>'organization_id'<>p_organization_id::text then raise exception 'Forbidden' using errcode='42501'; end if;
 target=coalesce((p_input->>'id')::uuid,gen_random_uuid()); expected=coalesce((p_input->>'version')::integer,1);
 execute format('select to_jsonb(t) from public.%I t where id=$1 and organization_id=$2',p_entity) into existing using target,p_organization_id;
 if existing is not null and (existing->>'version')::integer<>expected then raise exception 'Stale configuration; reload' using errcode='40001'; end if;
 if existing is null and expected<>1 then raise exception 'Unavailable record' using errcode='42501'; end if;
 for key_name in select jsonb_object_keys(p_input) loop
  if key_name in ('id','organization_id','version') then continue; end if;
  if key_name in ('created_at','updated_at') or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=p_entity and column_name=key_name) then raise exception 'Invalid field' using errcode='22023'; end if;
  if existing is not null and key_name in ('item_id','attribute_id','rate_id','key') and existing->key_name is distinct from p_input->key_name then raise exception 'Stable reference cannot change' using errcode='22023'; end if;
 end loop;
 if existing is not null and p_entity in ('price_book_items','pricing_costs') then raise exception 'Create a new rate revision instead' using errcode='22023'; end if;
 if p_replace_id is not null then
  if p_entity<>'price_book_items' then raise exception 'Invalid replacement' using errcode='22023'; end if;
  select * into previous from public.price_book_items where id=p_replace_id and organization_id=p_organization_id for update;
  if not found or previous.version is distinct from p_replace_version then raise exception 'Stale rate' using errcode='40001'; end if;
  if previous.item_id<>(p_input->>'item_id')::uuid or previous.price_book_id is distinct from (p_input->>'price_book_id')::uuid or previous.currency<>p_input->>'currency' or previous.valid_until is not null or previous.valid_from>=(p_input->>'valid_from')::timestamptz then raise exception 'Invalid replacement window' using errcode='22023'; end if;
  update public.price_book_items set valid_until=(p_input->>'valid_from')::timestamptz,version=version+1 where id=p_replace_id;
 end if;
 p_input=p_input-'id'-'organization_id'-'version';
 select string_agg(format('%I',key),',' order by key), string_agg(format('%I=r.%I',key,key),',' order by key) into columns_sql,assignments from jsonb_object_keys(p_input) key;
 if columns_sql is null then raise exception 'Empty mutation' using errcode='22023'; end if;
 if existing is null then
  execute format('insert into public.%1$I(id,organization_id,%2$s) select $1,$2,%2$s from jsonb_populate_record(null::public.%1$I,$3)',p_entity,columns_sql) using target,p_organization_id,p_input;
 else
  execute format('update public.%1$I t set %2$s,version=t.version+1 from jsonb_populate_record(null::public.%1$I,$3) r where t.id=$1 and t.organization_id=$2',p_entity,assignments) using target,p_organization_id,p_input;
 end if;
 perform private.validate_catalog(p_organization_id);
 return target;
end $$;
revoke all on function private.validate_catalog(uuid),private.audit_catalog() from public,anon,authenticated;
revoke all on function public.save_catalog_entity(uuid,text,jsonb,uuid,integer) from public,anon;
grant execute on function public.save_catalog_entity(uuid,text,jsonb,uuid,integer) to authenticated;
commit;
