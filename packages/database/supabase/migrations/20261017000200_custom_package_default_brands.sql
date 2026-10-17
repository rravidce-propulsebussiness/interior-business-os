-- Company Custom Package default brand choices and atomic SFT consumption updates.
-- Existing prices, package templates and issued customer quotations are not changed.
begin;

alter table private.construction_quote_rates
  add column is_default boolean not null default false;

create unique index construction_quote_rate_one_default_per_category
  on private.construction_quote_rates (organization_id, category)
  where is_default and status='active';

-- Preserve function transaction-mode contract (VOLATILE), pricing permissions,
-- customer organization boundaries and existing public output keys.
create or replace function public.construction_rate_list(p_org uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
begin
  perform private.require_permission(p_org,'pricing.view');
  if not private.entitled(p_org,'pricing') then
    raise exception 'Pricing module not enabled' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'category',r.category,'name',r.name,
    'specification',r.specification,'ratePerSqft',r.rate_per_sqft::text,
    'unitPrice',r.unit_price::text,'consumptionPerSqft',r.consumption_per_sqft::text,
    'priceUnit',r.price_unit,'isDefault',r.is_default,
    'status',r.status,'version',r.version) order by r.category,r.name,r.id)
    from private.construction_quote_rates r where r.organization_id=p_org),
    '[]'::jsonb);
end $fn$;

create function public.construction_custom_package_settings_save(
  p_org uuid, p_rows jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
  v_row jsonb;
  v_id uuid;
  v_version integer;
  v_usage numeric;
  v_target private.construction_quote_rates;
  v_seen text[] := '{}'::text[];
  v_ids uuid[] := '{}'::uuid[];
  v_categories text[] := '{}'::text[];
  v_count integer := 0;
begin
  perform private.require_permission(p_org,'pricing.manage');
  if not private.has_permission(p_org,'pricing.view') or
    not private.entitled(p_org,'pricing') then
    raise exception 'Pricing access denied' using errcode='42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows)>30 or octet_length(p_rows::text)>9000 then
    raise exception 'Invalid material selection' using errcode='22023';
  end if;

  -- Lock all organization rates in a deterministic order to serialize
  -- concurrent writes and prevent race conditions between default selections.
  perform 1 from private.construction_quote_rates
    where organization_id=p_org order by category,id for update;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) is distinct from 'object'
      or (v_row-array['id','version','consumptionPerSqft']) <> '{}'::jsonb
      or coalesce(v_row->>'id','') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(v_row->>'version','') !~ '^[1-9][0-9]{0,8}$'
      or coalesce(v_row->>'consumptionPerSqft','') !~
        '^(0|[1-9][0-9]{0,3})(\.[0-9]{1,4})?$'
    then raise exception 'Invalid material selection row' using errcode='22023';end if;
    v_id=(v_row->>'id')::uuid;
    v_version=(v_row->>'version')::integer;
    v_usage=(v_row->>'consumptionPerSqft')::numeric;
    if v_usage<=0 or v_usage>1000 or v_id=any(v_ids) then
      raise exception 'Invalid quantity or duplicate material' using errcode='22023';
    end if;
    select * into v_target from private.construction_quote_rates
      where organization_id=p_org and id=v_id and status='active';
    if not found or v_target.version<>v_version or
      v_target.category=any(v_seen) or round(v_target.unit_price*v_usage,2)>1000000
    then raise exception 'Material prices changed; reload and retry'
      using errcode='40001';
    end if;
    v_seen=array_append(v_seen,v_target.category);
    v_ids=array_append(v_ids,v_id);
    v_categories=array_append(v_categories,v_target.category);
    v_count=v_count+1;
  end loop;

  -- Apply new consumption, and select one default per category atomically.
  -- No prices are updated when no brand is selected.
  update private.construction_quote_rates r
    set is_default=false
    where organization_id=p_org and category=any(v_categories) and is_default;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_id=(v_row->>'id')::uuid;
    v_usage=(v_row->>'consumptionPerSqft')::numeric;
    update private.construction_quote_rates r
      set consumption_per_sqft=v_usage,
        rate_per_sqft=round(r.unit_price*v_usage,2),
        is_default=true,
        version=version+1
      where organization_id=p_org and id=v_id;
  end loop;
  insert into public.audit_logs(
    actor_user_id,organization_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),p_org,'construction.custom_package.saved',
    'construction_custom_package',p_org::text,
    jsonb_build_object('selectedMaterialCount',v_count));
  return jsonb_build_object('saved',v_count);
end $fn$;
revoke all on function public.construction_custom_package_settings_save(uuid,jsonb)
  from public,anon;
grant execute on function public.construction_custom_package_settings_save(uuid,jsonb)
  to authenticated;
commit;
