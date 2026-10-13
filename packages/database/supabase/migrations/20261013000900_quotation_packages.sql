-- Tenant-scoped, industry-aware quotation package templates.
-- Existing construction SFT packages retain their pricing engine and remain untouched.
begin;

create table private.quotation_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  industry_key text not null check (industry_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  code text not null check (code ~ '^[A-Z][A-Z0-9-]{1,19}$'),
  description text not null default '' check (length(description) <= 2000),
  pricing_basis text not null check (pricing_basis in ('fixed','per_sqft','per_bhk','per_unit')),
  base_price numeric(14,2) not null check (base_price > 0 and base_price <= 999999999.99),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','inactive')),
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,industry_key,code)
);
create index quotation_packages_list on private.quotation_packages(organization_id,industry_key,status,name);
alter table private.quotation_packages enable row level security;
revoke all on private.quotation_packages from public,anon,authenticated;
create trigger quotation_packages_updated before update on private.quotation_packages
 for each row execute function private.touch_updated_at();

create function public.quotation_package_list(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
 perform private.require_permission(p_org,'pricing.view');
 if not private.entitled(p_org,'pricing') then
  raise exception 'Pricing not enabled' using errcode='42501';
 end if;
 return coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',p.id,'industryKey',p.industry_key,'name',p.name,'code',p.code,
     'description',p.description,'pricingBasis',p.pricing_basis,
     'basePrice',p.base_price::text,'currency',p.currency,
     'status',p.status,'version',p.version
   ) order by p.industry_key,p.name,p.id)
   from private.quotation_packages p where p.organization_id=p_org
 ),'[]'::jsonb);
end $fn$;

create function public.quotation_package_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
 v_id uuid; v_result uuid; v_version integer; v_name text; v_code text;
 v_industry text; v_description text; v_price numeric; v_basis text;
 v_currency text; v_status text;
begin
 perform private.require_permission(p_org,'pricing.manage');
 if not private.has_permission(p_org,'pricing.view') or not private.entitled(p_org,'pricing') then
  raise exception 'Pricing access required' using errcode='42501';
 end if;
 if jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>3500
    or (p_input-array['id','version','industryKey','name','code','description','pricingBasis','basePrice','currency','status'])<>'{}'::jsonb
 then raise exception 'Invalid package' using errcode='22023'; end if;

 v_id = nullif(p_input->>'id','')::uuid;
 v_version = nullif(p_input->>'version','')::integer;
 v_name = btrim(coalesce(p_input->>'name',''));
 v_code = upper(btrim(coalesce(p_input->>'code','')));
 v_industry = btrim(coalesce(p_input->>'industryKey',''));
 v_description = btrim(coalesce(p_input->>'description',''));
 v_basis = p_input->>'pricingBasis';
 v_currency = p_input->>'currency';
 v_status = p_input->>'status';
 if length(v_name) not between 2 and 120
    or v_code !~ '^[A-Z][A-Z0-9-]{1,19}$'
    or v_industry !~ '^[a-z][a-z0-9_]{0,63}$'
    or v_industry = 'construction' -- Construction already uses the authoritative SFT package engine.
    or not exists (select 1 from public.industries i where i.key=v_industry and i.status='active')
    or length(v_description)>2000
    or v_basis not in ('fixed','per_sqft','per_bhk','per_unit')
    or v_currency !~ '^[A-Z]{3}$'
    or v_status not in ('active','inactive')
    or coalesce(p_input->>'basePrice','') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$'
 then raise exception 'Invalid package fields' using errcode='22023'; end if;
 v_price = (p_input->>'basePrice')::numeric;
 if v_price<=0 or v_price>999999999.99 then
  raise exception 'Invalid package price' using errcode='22023';
 end if;

 if v_id is null then
   insert into private.quotation_packages(
    organization_id,industry_key,name,code,description,pricing_basis,base_price,currency,status)
   values(p_org,v_industry,v_name,v_code,v_description,v_basis,v_price,v_currency,v_status)
   returning id into v_result;
 else
   if v_version is null or v_version<1 then
     raise exception 'Expected version' using errcode='22023';
   end if;
   update private.quotation_packages
   set industry_key=v_industry,name=v_name,code=v_code,description=v_description,
       pricing_basis=v_basis,base_price=v_price,currency=v_currency,status=v_status,
       version=version+1
   where organization_id=p_org and id=v_id and version=v_version
   returning id into v_result;
   if v_result is null then
     raise exception 'Package changed; reload' using errcode='40001';
   end if;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_org,'quotation.package.saved','quotation_package',v_result::text,
   jsonb_build_object('industry',v_industry,'code',v_code,'basis',v_basis));
 return v_result;
end $fn$;

revoke all on function public.quotation_package_list(uuid),
 public.quotation_package_save(uuid,jsonb) from public,anon;
grant execute on function public.quotation_package_list(uuid),
 public.quotation_package_save(uuid,jsonb) to authenticated;

commit;
