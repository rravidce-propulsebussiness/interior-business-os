-- Platform master packages are templates, not customer quotations.
-- Published templates are copied into existing tenant pricing engines exactly once.
-- Tenant edits, package PDFs, and issued quotations are never rewritten.
begin;

create table private.platform_master_quotation_packages (
  id uuid primary key default gen_random_uuid(),
  industry_key text not null check (industry_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  code text not null check (code ~ '^[A-Z][A-Z0-9-]{1,19}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  description text not null default '' check (length(description) <= 600),
  pricing_basis text not null default 'per_sqft'
    check (pricing_basis in ('fixed','per_sqft','per_bhk','per_unit')),
  base_price numeric(14,2) not null check (base_price > 0 and base_price <= 999999999.99),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  theme_color text not null default '#88352B' check (theme_color ~ '^#[A-Fa-f0-9]{6}$'),
  spec_sections jsonb not null default '[]'::jsonb
    check (jsonb_typeof(spec_sections)='array' and jsonb_array_length(spec_sections)<=32
      and octet_length(spec_sections::text)<=24000),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 1 check (version>0),
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(industry_key,code),
  check (industry_key <> 'construction' or (pricing_basis='per_sqft' and base_price<=1000000))
);
create trigger platform_master_quote_touch before update
  on private.platform_master_quotation_packages for each row
  execute function private.touch_updated_at();
alter table private.platform_master_quotation_packages enable row level security;
revoke all on private.platform_master_quotation_packages from public,anon,authenticated;

create table private.platform_master_quotation_installations (
  master_id uuid not null references private.platform_master_quotation_packages(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_package_id uuid not null,
  master_version integer not null check (master_version>0),
  installed_at timestamptz not null default now(),
  primary key(master_id,organization_id)
);
create index platform_master_installations_org
  on private.platform_master_quotation_installations(organization_id);
alter table private.platform_master_quotation_installations enable row level security;
revoke all on private.platform_master_quotation_installations from public,anon,authenticated;

-- Internal helper is reachable only from trusted security-definer RPCs/triggers.
create function private.install_platform_master_quotation(p_master uuid,p_org uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $fn$
declare
  v_master private.platform_master_quotation_packages%rowtype;
  v_owner uuid;
  v_company_package uuid;
  v_description text;
begin
  select * into v_master from private.platform_master_quotation_packages
    where id=p_master and status='published';
  if not found then return false; end if;
  select o.created_by into v_owner from public.organizations o
    where o.id=p_org and exists (
      select 1 from public.organization_industries oi
      join public.industries i on i.id=oi.industry_id
      where oi.organization_id=o.id and i.key=v_master.industry_key
    );
  if v_owner is null or not exists(select 1 from public.profiles where id=v_owner) then
    return false;
  end if;
  if exists (select 1 from private.platform_master_quotation_installations
             where master_id=p_master and organization_id=p_org) then
    return false;
  end if;
  -- Do not overwrite preexisting company-owned packages with the same code.
  if v_master.industry_key='construction' then
    insert into private.construction_quote_packages
      (organization_id,created_by,name,code,description,rate_per_sqft,status)
    values (p_org,v_owner,v_master.name,v_master.code,v_master.description,
            v_master.base_price,'active')
    on conflict (organization_id,code) do nothing
    returning id into v_company_package;
    if v_company_package is null then return false; end if;
    insert into private.construction_quote_package_designs
      (organization_id,package_id,theme_color,visibility,spec_sections,allowed_owner_ids)
    values (p_org,v_company_package,v_master.theme_color,'company',
            v_master.spec_sections,'{}'::uuid[]);
  else
    v_description := left(concat_ws(E'\n',v_master.description,
      (select string_agg(concat_ws(': ',s->>'title',
        concat_ws(' · ',nullif(s->>'brand',''),nullif(s->>'grade',''),nullif(s->>'description',''))),
        E'\n' order by ord)
        from jsonb_array_elements(v_master.spec_sections) with ordinality as entry(s,ord))
      ),2000);
    insert into private.quotation_packages
      (organization_id,created_by,industry_key,name,code,description,
       pricing_basis,base_price,currency,status)
    values (p_org,v_owner,v_master.industry_key,v_master.name,v_master.code,
            v_description,v_master.pricing_basis,v_master.base_price,v_master.currency,'active')
    on conflict (organization_id,industry_key,code) do nothing
    returning id into v_company_package;
    if v_company_package is null then return false; end if;
  end if;
  insert into private.platform_master_quotation_installations
    (master_id,organization_id,company_package_id,master_version)
  values (p_master,p_org,v_company_package,v_master.version)
  on conflict(master_id,organization_id) do nothing;
  return true;
end $fn$;
revoke all on function private.install_platform_master_quotation(uuid,uuid)
  from public,anon,authenticated;

-- The industry link is inserted during both owner and platform company onboarding.
create function private.distribute_platform_master_for_new_industry()
returns trigger language plpgsql volatile security definer set search_path='' as $fn$
declare v_master uuid; v_industry text;
begin
  select key into v_industry from public.industries where id=new.industry_id;
  for v_master in select id from private.platform_master_quotation_packages
    where status='published' and industry_key=v_industry order by code
  loop
    perform private.install_platform_master_quotation(v_master,new.organization_id);
  end loop;
  return new;
end $fn$;
revoke all on function private.distribute_platform_master_for_new_industry()
  from public,anon,authenticated;
create trigger distribute_platform_master_on_industry
after insert on public.organization_industries
for each row execute function private.distribute_platform_master_for_new_industry();

create function public.platform_master_quotation_list()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
  perform private.require_platform('platform.catalog.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',m.id,'industryKey',m.industry_key,'code',m.code,'name',m.name,
      'description',m.description,'pricingBasis',m.pricing_basis,
      'basePrice',m.base_price::text,'currency',m.currency,'themeColor',m.theme_color,
      'specSections',m.spec_sections,'status',m.status,'version',m.version,
      'publishedAt',m.published_at,
      'companyCount',(select count(*) from private.platform_master_quotation_installations x
                      where x.master_id=m.id)
    ) order by m.industry_key,m.name)
    from private.platform_master_quotation_packages m
  ),'[]'::jsonb);
end $fn$;

create function public.platform_master_quotation_save(p_input jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $fn$
declare
  v_id uuid; v_version integer; v_industry text; v_code text; v_name text;
  v_basis text; v_price numeric; v_sections jsonb; v_section jsonb;
  v_previous private.platform_master_quotation_packages%rowtype;
begin
  perform private.require_platform('platform.entitlements.manage');
  if jsonb_typeof(p_input) is distinct from 'object'
     or octet_length(p_input::text)>28000
     or (p_input-array['id','version','industryKey','code','name','description',
       'pricingBasis','basePrice','currency','themeColor','specSections'])<>'{}'::jsonb
  then raise exception 'Invalid master package' using errcode='22023'; end if;
  v_id=nullif(p_input->>'id','')::uuid;
  v_version=nullif(p_input->>'version','')::integer;
  v_industry=btrim(coalesce(p_input->>'industryKey',''));
  v_code=upper(btrim(coalesce(p_input->>'code','')));
  v_name=btrim(coalesce(p_input->>'name',''));
  v_basis=coalesce(p_input->>'pricingBasis','per_sqft');
  v_sections=coalesce(p_input->'specSections','[]'::jsonb);
  if v_industry !~ '^[a-z][a-z0-9_]{0,63}$'
     or not exists(select 1 from public.industries where key=v_industry and status='active')
     or v_code !~ '^[A-Z][A-Z0-9-]{1,19}$'
     or length(v_name) not between 2 and 120
     or length(coalesce(p_input->>'description',''))>600
     or v_basis not in ('fixed','per_sqft','per_bhk','per_unit')
     or (v_industry='construction' and v_basis<>'per_sqft')
     or coalesce(p_input->>'basePrice','') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$'
     or coalesce(p_input->>'currency','') !~ '^[A-Z]{3}$'
     or coalesce(p_input->>'themeColor','') !~ '^#[A-Fa-f0-9]{6}$'
     or jsonb_typeof(v_sections) is distinct from 'array'
     or jsonb_array_length(v_sections)>32
     or octet_length(v_sections::text)>24000
  then raise exception 'Invalid package fields' using errcode='22023'; end if;
  v_price=(p_input->>'basePrice')::numeric;
  if v_price<=0 or v_price>999999999.99 or (v_industry='construction' and v_price>1000000)
  then raise exception 'Invalid base rate' using errcode='22023'; end if;
  for v_section in select value from jsonb_array_elements(v_sections) loop
    if jsonb_typeof(v_section) is distinct from 'object'
       or (v_section-array['title','brand','grade','description','allowancePerSqft',
          'allowanceValue','unit','pricingTreatment'])<>'{}'::jsonb
       or length(btrim(coalesce(v_section->>'title',''))) not between 2 and 90
       or length(coalesce(v_section->>'brand',''))>120
       or length(coalesce(v_section->>'grade',''))>120
       or length(coalesce(v_section->>'description',''))>600
       or length(coalesce(v_section->>'allowancePerSqft',''))>40
       or coalesce(v_section->>'allowanceValue','') !~ '^(|[0-9]{1,9}([.][0-9]{1,2})?)$'
       or (v_section ? 'unit' and v_section->>'unit' not in
         ('none','sqft','bathroom','door','piece','kg','tonne','bag','cubic_meter',
          'running_ft','point','lumpsum','meter','bhk'))
       or (v_section ? 'pricingTreatment' and v_section->>'pricingTreatment' not in
         ('included','allowance','extra','excluded'))
    then raise exception 'Invalid package specification' using errcode='22023'; end if;
  end loop;
  if v_id is null then
    insert into private.platform_master_quotation_packages
      (industry_key,code,name,description,pricing_basis,base_price,currency,
       theme_color,spec_sections,created_by)
    values (v_industry,v_code,v_name,coalesce(p_input->>'description',''),v_basis,v_price,
      p_input->>'currency',p_input->>'themeColor',v_sections,auth.uid())
    returning id into v_id;
  else
    select * into v_previous from private.platform_master_quotation_packages where id=v_id for update;
    if not found or v_previous.version<>v_version then
      raise exception 'Master package changed; reload' using errcode='40001'; end if;
    if v_previous.status<>'draft' and
       (v_previous.code<>v_code or v_previous.industry_key<>v_industry) then
      raise exception 'Published package code and industry cannot change' using errcode='22023'; end if;
    update private.platform_master_quotation_packages
    set industry_key=v_industry,code=v_code,name=v_name,
        description=coalesce(p_input->>'description',''),pricing_basis=v_basis,
        base_price=v_price,currency=p_input->>'currency',theme_color=p_input->>'themeColor',
        spec_sections=v_sections,status='draft',version=version+1
    where id=v_id;
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'platform.master_quotation.saved','platform_master_quotation',v_id::text,
      jsonb_build_object('industry',v_industry,'code',v_code));
  return v_id;
end $fn$;

create function public.platform_master_quotation_status(
  p_id uuid,p_version integer,p_status text)
returns integer language plpgsql volatile security definer set search_path='' as $fn$
declare v_master private.platform_master_quotation_packages%rowtype;
        v_org uuid; v_added integer:=0;
begin
  perform private.require_platform('platform.entitlements.manage');
  if p_status not in ('published','archived') then
    raise exception 'Invalid package status' using errcode='22023'; end if;
  select * into v_master from private.platform_master_quotation_packages
    where id=p_id and version=p_version for update;
  if not found then raise exception 'Package changed; reload' using errcode='40001'; end if;
  if p_status='published' and jsonb_array_length(v_master.spec_sections)=0 then
    raise exception 'Add specifications before publishing' using errcode='22023'; end if;
  update private.platform_master_quotation_packages
  set status=p_status,version=version+1,
      published_at=case when p_status='published' then now() else published_at end
  where id=p_id;
  if p_status='published' then
    for v_org in
      select distinct oi.organization_id from public.organization_industries oi
      join public.industries i on i.id=oi.industry_id
      where i.key=v_master.industry_key
    loop
      if private.install_platform_master_quotation(p_id,v_org) then
        v_added:=v_added+1;
      end if;
    end loop;
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'platform.master_quotation.'||p_status,
      'platform_master_quotation',p_id::text,
      jsonb_build_object('newCompanyCopies',v_added));
  return v_added;
end $fn$;

revoke all on function public.platform_master_quotation_list(),
  public.platform_master_quotation_save(jsonb),
  public.platform_master_quotation_status(uuid,integer,text)
from public,anon,authenticated;
grant execute on function public.platform_master_quotation_list(),
  public.platform_master_quotation_save(jsonb),
  public.platform_master_quotation_status(uuid,integer,text) to authenticated;

-- Unlike tenant-specific original starter templates, these are platform reference
-- packages; values are illustrative and company-editable, not binding commitments.
insert into private.platform_master_quotation_packages
(industry_key,code,name,description,pricing_basis,base_price,currency,
 theme_color,spec_sections,status,version,published_at)
select 'construction',t.code,t.name,t.description,'per_sqft',t.price,'INR',
       '#88352B',jsonb_build_array(
  jsonb_build_object('title','Structure & Civil','brand','','grade','M25 / Fe500D',
    'description','RCC frame, design-led steel and approved cement','allowancePerSqft','',
    'unit','none','pricingTreatment','included','allowanceValue',''),
  jsonb_build_object('title','Walls & Masonry','brand','','grade','',
    'description','External 9-inch and internal 4-inch walls, subject to drawings',
    'allowancePerSqft','','unit','none','pricingTreatment','included','allowanceValue',''),
  jsonb_build_object('title','Doors & Windows','brand','UPVC / aluminium','grade','',
    'description','Main, internal and bathroom doors with size-based allowances',
    'allowancePerSqft','','unit','door','pricingTreatment','allowance','allowanceValue','15000'),
  jsonb_build_object('title','Flooring & Tiles','brand','Vitrified tiles','grade','',
    'description','Tiles, granite, skirting and bathroom/parking inclusions',
    'allowancePerSqft','','unit','sqft','pricingTreatment','allowance',
    'allowanceValue',t.tile::text),
  jsonb_build_object('title','Electrical','brand','ISI-marked wiring','grade','',
    'description','Wiring, conduits, MCB and modular switches',
    'allowancePerSqft','','unit','none','pricingTreatment','included','allowanceValue',''),
  jsonb_build_object('title','Plumbing & Sanitary','brand','CPVC / PVC','grade','',
    'description','Pipes, waterproofing, fittings and sanitaryware',
    'allowancePerSqft','','unit','bathroom','pricingTreatment','allowance',
    'allowanceValue',t.sanitary::text),
  jsonb_build_object('title','Painting & Finishes','brand','Approved paint brands','grade','',
    'description','Internal putty, primer and two coats; external finish as agreed',
    'allowancePerSqft','','unit','none','pricingTreatment','included','allowanceValue',''),
  jsonb_build_object('title','Warranty & Support','brand','','grade','',
    'description','Company to confirm structural, seepage and post-handover warranties',
    'allowancePerSqft','','unit','none','pricingTreatment','included','allowanceValue','')
),'published',1,now()
from (values
 ('STANDARD','Standard Package','Quality construction at a competitive base rate',1599::numeric,80,20000),
 ('PREMIUM','Premium Package','Upgraded materials and premium finishing',1799::numeric,120,35000),
 ('LUXURY','Luxury Package','Higher-end material allowances and finishing',2100::numeric,180,50000)
) as t(code,name,description,price,tile,sanitary)
on conflict(industry_key,code) do nothing;

-- Backfill only missing company package codes. Never alter existing rows.
do $backfill$
declare v_master uuid; v_org uuid;
begin
  for v_master,v_org in
    select m.id,oi.organization_id from private.platform_master_quotation_packages m
    join public.industries i on i.key=m.industry_key
    join public.organization_industries oi on oi.industry_id=i.id
    where m.status='published'
  loop
    perform private.install_platform_master_quotation(v_master,v_org);
  end loop;
end $backfill$;
commit;
