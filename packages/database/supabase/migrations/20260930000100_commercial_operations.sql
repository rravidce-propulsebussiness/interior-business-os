begin;
create function public.save_commercial_entity(p_organization_id uuid,p_entity text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;prior jsonb;columns_sql text;assignments text;k text;permission text;capability text;
begin
 if p_entity not in ('customers','customer_contacts','projects','project_areas','organization_quotation_settings') then raise exception 'Invalid entity' using errcode='22023';end if;
 target=coalesce((p_input->>'id')::uuid,gen_random_uuid());
 perform 1 from public.organizations where id=p_organization_id for update;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',p_entity) into prior using p_organization_id,target;
 permission=case when p_entity='customers' then case when prior is null then 'customer.create' else 'customer.manage' end when p_entity='customer_contacts' then 'customer.manage' when p_entity='projects' then case when prior is null then 'project.create' else 'project.manage' end when p_entity='project_areas' then 'project.manage' else 'settings.manage' end;
 capability=case when p_entity like 'customer%' then 'customers' when p_entity like 'project%' then 'projects' else 'quotation' end;
 if not private.commercial_access(p_organization_id,permission,capability) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>220000 or (p_input ? 'organization_id' and p_input->>'organization_id'<>p_organization_id::text) then raise exception 'Invalid input' using errcode='22023';end if;
 if prior is not null and (prior->>'version')::integer is distinct from (p_input->>'version')::integer then raise exception 'Stale version' using errcode='40001';end if;
 if prior is null and coalesce((p_input->>'version')::integer,1)<>1 then raise exception 'Unavailable' using errcode='42501';end if;
 for k in select jsonb_object_keys(p_input) loop
  if k in ('id','organization_id','version') then continue;end if;
  if k in ('created_by','created_at','updated_at') or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=p_entity and column_name=k) then raise exception 'Invalid field' using errcode='22023';end if;
  if prior is not null and k in ('customer_id','project_id') and prior->k is distinct from p_input->k then raise exception 'Stable parent cannot change' using errcode='22023';end if;
 end loop;
 p_input=p_input-'id'-'organization_id'-'version';
 select string_agg(format('%I',key),',' order by key),string_agg(format('%I=r.%I',key,key),',' order by key) into columns_sql,assignments from jsonb_object_keys(p_input) key;
 if columns_sql is null then raise exception 'Empty input' using errcode='22023';end if;
 if prior is null then execute format('insert into public.%1$I(id,organization_id,%2$s) select $1,$2,%2$s from jsonb_populate_record(null::public.%1$I,$3)',p_entity,columns_sql) using target,p_organization_id,p_input;
 else execute format('update public.%1$I t set %2$s,version=t.version+1 from jsonb_populate_record(null::public.%1$I,$3) r where t.id=$1 and t.organization_id=$2',p_entity,assignments) using target,p_organization_id,p_input;end if;
 if p_entity='project_areas' and exists(with recursive walk as(select id,parent_id,array[id] path,false cycle from public.project_areas where organization_id=p_organization_id union all select w.id,a.parent_id,w.path||a.id,a.id=any(w.path) from walk w join public.project_areas a on a.id=w.parent_id where not w.cycle)select 1 from walk where cycle) then raise exception 'Area cycle' using errcode='22023';end if;
 return target;
end $$;

create function public.commercial_search(p_organization_id uuid,p_entity text,p_query text default '',p_page integer default 1,p_status text default '',p_parent_id uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;count_rows bigint;q text;filter_sql text;label_column text;
begin
 if p_entity not in ('customers','projects','quotations','catalog_items','catalog_categories') or p_page not between 1 and 10000 or length(p_query)>100 then raise exception 'Invalid search' using errcode='22023';end if;
 if not private.is_member(p_organization_id) then raise exception 'Forbidden' using errcode='42501';end if;
 label_column=case when p_entity='customers' then 'display_name' when p_entity='quotations' then 'quotation_number' else 'name' end;
 q=replace(replace(replace(lower(p_query),'\','\\'),'%','\%'),'_','\_')||'%';
 if p_entity='quotations' then
  select count(*) into count_rows from public.quotation_revisions r join public.quotations t on t.id=r.quotation_id where r.organization_id=p_organization_id and lower(t.quotation_number) like q and (p_status='' or r.status=p_status);
  select coalesce(jsonb_agg(x),'[]') into result from (select r.id,t.quotation_number,r.revision_number,r.valid_until,r.totals->>'final_amount' amount,r.currency,r.status,r.document_snapshot->'customer'->>'name' customer_name,r.document_snapshot->'project'->>'name' project_name from public.quotation_revisions r join public.quotations t on t.id=r.quotation_id where r.organization_id=p_organization_id and lower(t.quotation_number) like q and (p_status='' or r.status=p_status) order by r.created_at desc,r.id limit 25 offset (p_page-1)*25) x;
  return jsonb_build_object('rows',result,'total',count_rows,'page',p_page,'page_size',25);
 end if;
 filter_sql=format('organization_id=$1 and lower(%I) like $2 and ($3='''' or status=$3)',label_column);
 if p_entity='projects' then filter_sql=filter_sql||' and ($4 is null or customer_id=$4)';elsif p_entity='catalog_items' then filter_sql=filter_sql||' and ($4 is null or category_id=$4)';else filter_sql=filter_sql||' and ($4 is null or $4 is not null)';end if;
 execute format('select count(*) from public.%I where %s',p_entity,filter_sql) into count_rows using p_organization_id,q,p_status,p_parent_id;
 if p_entity='quotations' then
  execute format('select coalesce(jsonb_agg(x),''[]'') from (select t.*,r.revision_number,r.valid_until,r.totals->>''final_amount'' amount,r.currency,r.status revision_status,c.display_name customer_name,p.name project_name from public.quotations t join public.quotation_revisions r on r.id=t.current_revision_id join public.customers c on c.id=t.customer_id join public.projects p on p.id=t.project_id where t.organization_id=$1 and lower(t.quotation_number) like $2 and ($3='''' or t.status=$3) and ($4 is null or $4 is not null) order by t.created_at desc,t.id limit 25 offset $5) x') into result using p_organization_id,q,p_status,p_parent_id,(p_page-1)*25;
 else execute format('select coalesce(jsonb_agg(x),''[]'') from (select * from public.%I where %s order by lower(%I),id limit 25 offset $5) x',p_entity,filter_sql,label_column) into result using p_organization_id,q,p_status,p_parent_id,(p_page-1)*25;end if;
 return jsonb_build_object('rows',result,'total',count_rows,'page',p_page,'page_size',25);
end $$;

create function private.quotation_catalog_data(org uuid,item uuid,branch uuid) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(t order by id) from public.catalog_categories t where organization_id=org and id=(select category_id from public.catalog_items where id=item and organization_id=org)),'[]'),
 'items',coalesce((select jsonb_agg(t order by id) from public.catalog_items t where organization_id=org and id=item),'[]'),
 'attributes',coalesce((select jsonb_agg(t order by id) from public.catalog_item_attributes t where organization_id=org and item_id=item),'[]'),
 'options',coalesce((select jsonb_agg(t order by id) from public.catalog_attribute_options t where organization_id=org and item_id=item),'[]'),
 'books',coalesce((select jsonb_agg(t order by id) from public.price_books t where organization_id=org and (branch_id is null or branch_id=branch)),'[]'),
 'rates',coalesce((select jsonb_agg(t order by id) from public.price_book_items t where organization_id=org and item_id=item),'[]'),
 'costs',coalesce((select jsonb_agg(t order by id) from public.pricing_costs t where organization_id=org and rate_id in(select id from public.price_book_items where item_id=item and organization_id=org)),'[]'),
 'modifiers',coalesce((select jsonb_agg(t order by id) from public.pricing_modifiers t where organization_id=org and item_id=item),'[]'),
 'units',(select jsonb_agg(t order by key) from public.units t),'methods',(select jsonb_agg(t order by key) from public.measurement_methods t),
 'branches',coalesce((select jsonb_agg(t order by id) from public.branches t where organization_id=org and id=branch and status='active'),'[]'));
$$;
create function private.require_quote_catalog(org uuid,item uuid,branch uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not private.commercial_access(org,'quotation.edit','quotation') or not private.has_permission(org,'catalog.view') or not private.entitled(org,'catalog') or not private.entitled(org,'pricing') or not exists(select 1 from public.catalog_items where id=item and organization_id=org and status='active') or (branch is not null and not exists(select 1 from public.branches where id=branch and organization_id=org and status='active')) then raise exception 'Forbidden' using errcode='42501';end if;
end $$;
create function public.quotation_item_configuration(p_organization_id uuid,p_item_id uuid,p_branch_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_quote_catalog(p_organization_id,p_item_id,p_branch_id);return jsonb_set(private.quotation_catalog_data(p_organization_id,p_item_id,p_branch_id),'{costs}','[]');end $$;

create function private.verify_quotation_message(message text,signature text,operation text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare envelope jsonb;key_hex text;
begin
 if octet_length(message)>1000000 or signature !~ '^[0-9a-f]{64}$' then raise exception 'Invalid attestation' using errcode='42501';end if;
 select secret_hex into key_hex from private.quotation_signing_keys where singleton;
 if key_hex is null or encode(extensions.hmac(convert_to(message,'UTF8'),decode(key_hex,'hex'),'sha256'),'hex') is distinct from signature then raise exception 'Invalid attestation' using errcode='42501';end if;
 envelope=message::jsonb;
 if (jsonb_typeof(envelope)='object' and envelope->>'operation'=operation and (envelope->>'actor')::uuid=auth.uid() and (envelope->>'expires')::bigint between extract(epoch from now()) and extract(epoch from now())+120 and private.is_member((envelope->>'organization_id')::uuid) and (envelope->>'nonce')::uuid is not null) is not true then raise exception 'Invalid attestation' using errcode='42501';end if;
 return envelope;
end $$;
create function public.quotation_calculation_context(p_message text,p_signature text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e jsonb;c jsonb;org uuid;item uuid;branch uuid;
begin e=private.verify_quotation_message(p_message,p_signature,'pricing_context');org=(e->>'organization_id')::uuid;item=(e->>'item_id')::uuid;branch=(e->>'branch_id')::uuid;perform private.require_quote_catalog(org,item,branch);c=private.quotation_catalog_data(org,item,branch);return jsonb_build_object('catalog',c,'fingerprint',md5(c::text));end $$;
revoke all on function private.quotation_catalog_data(uuid,uuid,uuid),private.require_quote_catalog(uuid,uuid,uuid),private.verify_quotation_message(text,text,text) from public,anon,authenticated;
revoke all on function public.save_commercial_entity(uuid,text,jsonb),public.commercial_search(uuid,text,text,integer,text,uuid),public.quotation_item_configuration(uuid,uuid,uuid),public.quotation_calculation_context(text,text) from public,anon;
grant execute on function public.save_commercial_entity(uuid,text,jsonb),public.commercial_search(uuid,text,text,integer,text,uuid),public.quotation_item_configuration(uuid,uuid,uuid),public.quotation_calculation_context(text,text) to authenticated;
commit;

