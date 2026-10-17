-- Tenant-owned brand price cards for dynamic Custom Quote SFT construction.
-- All previous published quotation snapshots remain immutable; older prices
-- migrate to equivalent per-SFT unit prices with consumption 1.
begin;

alter table private.construction_quote_rates
  add column price_unit text not null default 'sqft',
  add column unit_price numeric(12,2),
  add column consumption_per_sqft numeric(12,4) not null default 1;

update private.construction_quote_rates
set unit_price = rate_per_sqft
where unit_price is null;

alter table private.construction_quote_rates
  alter column unit_price set not null,
  add constraint construction_rate_price_unit_check
    check(price_unit in ('sqft','kg','tonne','bag','piece','brick','cft','litre','meter','running_ft','bathroom','door','point','lumpsum')),
  add constraint construction_rate_unit_price_check
    check(unit_price >= 0 and unit_price <= 1000000),
  add constraint construction_rate_consumption_check
    check(consumption_per_sqft > 0 and consumption_per_sqft <= 1000);

create or replace function public.construction_rate_list(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.require_permission(p_org,'pricing.view');
 if not private.entitled(p_org,'pricing') then
  raise exception 'Pricing module not enabled' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'category',r.category,'name',r.name,
  'specification',r.specification,'ratePerSqft',r.rate_per_sqft::text,
  'unitPrice',r.unit_price::text,'consumptionPerSqft',r.consumption_per_sqft::text,
  'priceUnit',r.price_unit,
  'status',r.status,'version',r.version) order by r.category,r.name,r.id)
 from private.construction_quote_rates r where r.organization_id=p_org),'[]'::jsonb);
end $fn$;

create or replace function public.construction_rate_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare
 rid uuid; v_id uuid; v_version integer;
 v_name text; v_category text; v_spec text;
 v_price numeric; v_usage numeric; v_rate numeric; v_unit text;
begin
 perform private.require_permission(p_org,'pricing.manage');
 if not private.has_permission(p_org,'pricing.view') or not private.entitled(p_org,'pricing')
 then raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2400
   or (p_input-array[
    'id','version','category','name','specification','ratePerSqft',
    'unitPrice','consumptionPerSqft','priceUnit','status'
   ])<>'{}'::jsonb
 then raise exception 'Invalid construction material rate' using errcode='22023';end if;
 v_name=btrim(coalesce(p_input->>'name',''));
 v_category=btrim(coalesce(p_input->>'category',''));
 v_spec=btrim(coalesce(p_input->>'specification',''));
 v_unit=coalesce(p_input->>'priceUnit','sqft');
 if length(v_name) not between 2 and 120 or length(v_category) not between 2 and 50
   or length(v_spec)>250
   or coalesce(p_input->>'status','') not in ('active','inactive')
   or v_unit not in ('sqft','kg','tonne','bag','piece','brick','cft','litre','meter','running_ft','bathroom','door','point','lumpsum')
   or coalesce(p_input->>'unitPrice',p_input->>'ratePerSqft','') !~ '^(0|[1-9][0-9]{0,6})(\.[0-9]{1,2})?$'
   or coalesce(p_input->>'consumptionPerSqft','1') !~ '^(0|[1-9][0-9]{0,3})(\.[0-9]{1,4})?$'
 then raise exception 'Invalid price, unit or quantity' using errcode='22023';end if;
 v_price=coalesce(p_input->>'unitPrice',p_input->>'ratePerSqft')::numeric;
 v_usage=coalesce(p_input->>'consumptionPerSqft','1')::numeric;
 v_rate=round(v_price*v_usage,2);
 if v_price<0 or v_price>1000000 or v_usage<=0 or v_usage>1000
   or v_rate>1000000
 then raise exception 'Rate exceeds allowed limits' using errcode='22023';end if;
 v_id=nullif(p_input->>'id','')::uuid;
 if v_id is null then
  insert into private.construction_quote_rates(
    organization_id,category,name,specification,rate_per_sqft,
    unit_price,consumption_per_sqft,price_unit,status
  ) values (p_org,v_category,v_name,v_spec,v_rate,v_price,v_usage,v_unit,p_input->>'status')
  returning id into rid;
 else
  v_version=(p_input->>'version')::integer;
  if v_version is null or v_version<1
  then raise exception 'Expected current version' using errcode='22023';end if;
  update private.construction_quote_rates
   set category=v_category,name=v_name,specification=v_spec,
       unit_price=v_price,consumption_per_sqft=v_usage,price_unit=v_unit,
       rate_per_sqft=v_rate,status=p_input->>'status',version=version+1
   where organization_id=p_org and id=v_id and version=v_version
   returning id into rid;
  if rid is null
  then raise exception 'Rate changed; reload and retry' using errcode='40001';end if;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_org,'construction.rate.saved','construction_quote_rate',
 rid::text,jsonb_build_object('category',v_category,'unit',v_unit,
 'pricePerUnit',v_price,'consumptionPerSqft',v_usage,'ratePerSqft',v_rate));
 return rid;
end $fn$;

-- Server-only authoritative price; selected brands are unique by category.
-- Quote cannot substitute client-supplied unit prices for company price cards.
create or replace function public.construction_rate_quote_preview(
 p_org uuid,p_ids uuid[],p_area numeric)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_rows jsonb; v_count integer; v_total numeric; v_rate numeric;
begin
 perform private.require_permission(p_org,'pricing.view');
 if not private.entitled(p_org,'pricing')
 then raise exception 'Pricing module unavailable' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids) not between 1 and 20
  or p_area is null or p_area<=0 or p_area>1000000
  or round(p_area,2)<>p_area
  or (select count(distinct x) from unnest(p_ids) x)<>cardinality(p_ids)
 then raise exception 'Select valid brands and construction area' using errcode='22023';end if;
 select count(*),coalesce(sum(rate_per_sqft),0),
 coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'category',category,'name',name,'specification',specification,
  'ratePerSqft',rate_per_sqft::text,'unitPrice',unit_price::text,
  'consumptionPerSqft',consumption_per_sqft::text,'priceUnit',price_unit,
  'version',version) order by category,name,id),'[]'::jsonb)
 into v_count,v_rate,v_rows
 from private.construction_quote_rates
 where organization_id=p_org and status='active' and id=any(p_ids);
 if v_count<>cardinality(p_ids)
 then raise exception 'Selected brand or price is unavailable' using errcode='22023';end if;
 if (select count(distinct category) from private.construction_quote_rates
   where organization_id=p_org and status='active' and id=any(p_ids))<>v_count
 then raise exception 'Choose one brand per material category' using errcode='22023';end if;
 v_total=round(v_rate*p_area,2);
 return jsonb_build_object('options',v_rows,'areaSqft',p_area::text,
  'ratePerSqft',v_rate::text,'total',v_total::text);
end $fn$;

revoke all on function
 public.construction_rate_list(uuid),
 public.construction_rate_save(uuid,jsonb),
 public.construction_rate_quote_preview(uuid,uuid[],numeric) from public,anon;
grant execute on function
 public.construction_rate_list(uuid),
 public.construction_rate_save(uuid,jsonb),
 public.construction_rate_quote_preview(uuid,uuid[],numeric) to authenticated;

commit;
