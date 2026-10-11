-- Per-company construction quotation choices. Per-sq-ft of BUILT-UP area,
-- not physical material purchase units. Rates are never shared across tenants.
begin;
create table private.construction_quote_rates(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 category text not null check(length(btrim(category)) between 2 and 50),
 name text not null check(length(btrim(name)) between 2 and 120),
 specification text not null default '' check(length(specification)<=250),
 rate_per_sqft numeric(12,2) not null check(rate_per_sqft>=0 and rate_per_sqft<=1000000),
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (organization_id,id)
);
create index construction_quote_rates_org on private.construction_quote_rates
(organization_id,status,category,name,id);
alter table private.construction_quote_rates enable row level security;
revoke all on private.construction_quote_rates from public,anon,authenticated;
create trigger construction_quote_rates_touch before update on private.construction_quote_rates
for each row execute function private.touch_updated_at();

create function public.construction_rate_list(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.require_permission(p_org,'pricing.view');
 if not private.entitled(p_org,'pricing') then
  raise exception 'Pricing module not enabled' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'category',r.category,'name',r.name,
  'specification',r.specification,'ratePerSqft',r.rate_per_sqft::text,
  'status',r.status,'version',r.version) order by r.category,r.name,r.id)
 from private.construction_quote_rates r where r.organization_id=p_org),'[]'::jsonb);
end $fn$;

create function public.construction_rate_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare rid uuid; v_id uuid; v_version integer; v_old private.construction_quote_rates;
 v_name text; v_category text; v_spec text; v_amount numeric;
begin
 perform private.require_permission(p_org,'pricing.manage');
 if not private.has_permission(p_org,'pricing.view') or not private.entitled(p_org,'pricing')
 then raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2000
  or (p_input-array['id','version','category','name','specification','ratePerSqft','status'])<>'{}'::jsonb
 then raise exception 'Invalid construction price option' using errcode='22023';end if;
 v_name=btrim(coalesce(p_input->>'name',''));
 v_category=btrim(coalesce(p_input->>'category',''));
 v_spec=btrim(coalesce(p_input->>'specification',''));
 if length(v_name) not between 2 and 120 or length(v_category) not between 2 and 50
  or length(v_spec)>250 or coalesce(p_input->>'ratePerSqft','') !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$'
  or coalesce(p_input->>'status','') not in ('active','inactive')
 then raise exception 'Invalid construction rate fields' using errcode='22023';end if;
 v_amount=(p_input->>'ratePerSqft')::numeric;
 v_id=nullif(p_input->>'id','')::uuid;
 if v_id is null then
  insert into private.construction_quote_rates(organization_id,category,name,specification,rate_per_sqft,status)
   values(p_org,v_category,v_name,v_spec,v_amount,p_input->>'status')
  returning id into rid;
 else
  v_version=(p_input->>'version')::integer;
  if v_version is null or v_version<1 then
   raise exception 'Expected current version' using errcode='22023';end if;
  update private.construction_quote_rates
   set category=v_category,name=v_name,specification=v_spec,rate_per_sqft=v_amount,
       status=p_input->>'status',version=version+1
   where organization_id=p_org and id=v_id and version=v_version
   returning id into rid;
  if rid is null then raise exception 'Rate changed; reload and try again' using errcode='40001';end if;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,
 metadata) values(auth.uid(),p_org,'construction.rate.saved','construction_quote_rate',
 rid::text,jsonb_build_object('category',v_category,'pricePerSqft',v_amount));
 return rid;
end $fn$;

-- Authoritative quote selection resolves current active rates on the server,
-- returns a pricing fingerprint and amount. It never accepts client rate inputs.
create function public.construction_rate_quote_preview(
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
 then raise exception 'Select valid options and construction area' using errcode='22023';end if;
 select count(*),coalesce(sum(rate_per_sqft),0),
 coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'category',category,'name',name,'specification',specification,
  'ratePerSqft',rate_per_sqft::text,'version',version) order by category,name,id),'[]'::jsonb)
 into v_count,v_rate,v_rows
 from private.construction_quote_rates
 where organization_id=p_org and status='active' and id=any(p_ids);
 if v_count<>cardinality(p_ids)
 then raise exception 'One or more selected prices are unavailable' using errcode='22023'; end if;
 if (select count(distinct category) from private.construction_quote_rates
   where organization_id=p_org and status='active' and id=any(p_ids))<>v_count
 then raise exception 'Choose one brand/grade per material category' using errcode='22023';end if;
 v_total=round(v_rate*p_area,2);
 return jsonb_build_object('options',v_rows,'areaSqft',p_area::text,
  'ratePerSqft',v_rate::text,'total',v_total::text);
end $fn$;

revoke all on function
 public.construction_rate_list(uuid),
 public.construction_rate_save(uuid,jsonb),
 public.construction_rate_quote_preview(uuid,uuid[],numeric)
 from public,anon;
grant execute on function
 public.construction_rate_list(uuid),
 public.construction_rate_save(uuid,jsonb),
 public.construction_rate_quote_preview(uuid,uuid[],numeric)
 to authenticated;
commit;
