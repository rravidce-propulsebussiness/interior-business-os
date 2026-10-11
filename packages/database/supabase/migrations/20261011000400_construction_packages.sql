-- Construction quotations support either a fixed package ₹/built-up-sq-ft
-- with independently selectable specifications, or material-wise pricing.
-- No changes to existing issued revisions, invoice data or shared tenants.
begin;
create table private.construction_quote_packages(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 2 and 120),
 code text not null check(code ~ '^[A-Z][A-Z0-9-]{1,19}$'),
 description text not null default '' check(length(description)<=600),
 rate_per_sqft numeric(12,2) not null check(rate_per_sqft>0 and rate_per_sqft<=1000000),
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,code)
);
create index construction_quote_packages_lookup
 on private.construction_quote_packages(organization_id,status,name);
alter table private.construction_quote_packages enable row level security;
revoke all on private.construction_quote_packages from public,anon,authenticated;
create trigger construction_quote_packages_touch before update on private.construction_quote_packages
 for each row execute function private.touch_updated_at();

create function public.construction_package_list(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.require_permission(p_org,'pricing.view');
 if not private.entitled(p_org,'pricing') then raise exception 'Pricing not enabled' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.name,'code',p.code,'description',p.description,
 'ratePerSqft',p.rate_per_sqft::text,'status',p.status,'version',p.version)
 order by p.name,p.id)
 from private.construction_quote_packages p where p.organization_id=p_org),'[]'::jsonb);
end $fn$;

create function public.construction_package_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid; v_result uuid; v_version integer; v_name text; v_code text; v_description text; v_rate numeric;
begin
 perform private.require_permission(p_org,'pricing.manage');
 if not private.has_permission(p_org,'pricing.view') or not private.entitled(p_org,'pricing')
 then raise exception 'Pricing access required' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2200
 or (p_input-array['id','version','name','code','description','ratePerSqft','status'])<>'{}'::jsonb
 then raise exception 'Invalid package' using errcode='22023';end if;
 v_name=btrim(coalesce(p_input->>'name',''));
 v_code=upper(btrim(coalesce(p_input->>'code','')));
 v_description=btrim(coalesce(p_input->>'description',''));
 if length(v_name) not between 2 and 120 or v_code !~ '^[A-Z][A-Z0-9-]{1,19}$'
 or length(v_description)>600
 or coalesce(p_input->>'ratePerSqft','') !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$'
 or (p_input->>'ratePerSqft')::numeric<=0
 or coalesce(p_input->>'status','') not in ('active','inactive')
 then raise exception 'Invalid package fields' using errcode='22023';end if;
 v_rate=(p_input->>'ratePerSqft')::numeric;
 v_id=nullif(p_input->>'id','')::uuid;
 if v_id is null then
  insert into private.construction_quote_packages(organization_id,name,code,description,rate_per_sqft,status)
  values(p_org,v_name,v_code,v_description,v_rate,p_input->>'status') returning id into v_result;
 else
  v_version=(p_input->>'version')::integer;
  if v_version is null or v_version<1 then raise exception 'Expected version' using errcode='22023';end if;
  update private.construction_quote_packages
  set name=v_name,code=v_code,description=v_description,rate_per_sqft=v_rate,
   status=p_input->>'status',version=version+1
  where organization_id=p_org and id=v_id and version=v_version returning id into v_result;
  if v_result is null then raise exception 'Package changed; reload' using errcode='40001';end if;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_org,'construction.package.saved','construction_quote_package',v_result::text,
 jsonb_build_object('code',v_code,'ratePerSqft',v_rate));
 return v_result;
end $fn$;

-- Selected brands and specifications do not affect a fixed-package total.
-- A package's own price is authoritative even if the chosen materials have
-- independent rates used by customized quotations.
create function public.construction_package_quote_preview(
 p_org uuid,p_package_id uuid,p_ids uuid[],p_area numeric)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare p private.construction_quote_packages; v_count int; v_categories int; v_options jsonb;
begin
 perform private.require_permission(p_org,'pricing.view');
 if not private.entitled(p_org,'pricing') then raise exception 'Pricing not enabled' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>20 or p_area is null or p_area<=0 or p_area>1000000
 or round(p_area,2)<>p_area or (select count(distinct x) from unnest(p_ids) x)<>cardinality(p_ids)
 then raise exception 'Invalid area or material options' using errcode='22023';end if;
 select * into p from private.construction_quote_packages
  where organization_id=p_org and id=p_package_id and status='active';
 if not found then raise exception 'Package unavailable' using errcode='22023';end if;
 select count(*),count(distinct category),
 coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'name',name,
 'specification',specification,'version',version) order by category,name,id),'[]'::jsonb)
 into v_count,v_categories,v_options
 from private.construction_quote_rates
 where organization_id=p_org and status='active' and id=any(p_ids);
 if v_count<>cardinality(p_ids) or v_categories<>v_count
 then raise exception 'Choose one active brand per category' using errcode='22023';end if;
 return jsonb_build_object('packageId',p.id,'packageName',p.name,
 'packageCode',p.code,'description',p.description,'ratePerSqft',p.rate_per_sqft::text,
 'areaSqft',p_area::text,'total',round(p.rate_per_sqft*p_area,2)::text,'options',v_options);
end $fn$;

revoke all on function public.construction_package_list(uuid),
 public.construction_package_save(uuid,jsonb),
 public.construction_package_quote_preview(uuid,uuid,uuid[],numeric) from public,anon;
grant execute on function public.construction_package_list(uuid),
 public.construction_package_save(uuid,jsonb),
 public.construction_package_quote_preview(uuid,uuid,uuid[],numeric) to authenticated;
commit;
