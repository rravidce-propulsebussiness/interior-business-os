-- Multi-industry B2B marketplace foundation: isolated sellers, products and requests.
-- Seller approval is platform-controlled; no payments, inventory reservation or
-- automatic fulfilment is implied by a requested purchase.
begin;

create table private.marketplace_sellers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null unique references public.organizations(id),
 display_name text not null check (length(display_name) between 2 and 150),
 status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
 applied_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index marketplace_sellers_review on private.marketplace_sellers(status,created_at desc);
create table private.marketplace_products (
 id uuid primary key default gen_random_uuid(),
 seller_id uuid not null references private.marketplace_sellers(id),
 industry_id uuid not null references public.industries(id),
 sku text not null check (length(sku) between 1 and 64),
 name text not null check (length(name) between 2 and 160),
 category text not null check (length(category) between 2 and 100),
 unit text not null check (length(unit) between 1 and 30),
 price numeric(14,2) not null check (price > 0 and price <= 100000000000),
 minimum_quantity numeric(14,3) not null default 1 check (minimum_quantity > 0),
 currency text not null check (currency ~ '^[A-Z]{3}$'),
 status text not null default 'draft' check (status in ('draft','published','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(seller_id,sku)
);
create index marketplace_products_browse on private.marketplace_products(industry_id,status,created_at desc);
create table private.marketplace_orders (
 id uuid primary key default gen_random_uuid(),
 buyer_organization_id uuid not null references public.organizations(id),
 seller_id uuid not null references private.marketplace_sellers(id),
 product_id uuid not null references private.marketplace_products(id),
 quantity numeric(14,3) not null check (quantity > 0),
 unit_price numeric(14,2) not null check (unit_price > 0),
 total numeric(17,2) not null check (total > 0),
 currency text not null check (currency ~ '^[A-Z]{3}$'),
 product_name text not null,
 seller_name text not null,
 buyer_name text not null,
 status text not null default 'requested' check (status in ('requested','accepted','rejected')),
 requested_by uuid not null references public.profiles(id),
 idempotency_key uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(buyer_organization_id,idempotency_key)
);
create index marketplace_orders_buyer on private.marketplace_orders(buyer_organization_id,created_at desc);
create index marketplace_orders_seller on private.marketplace_orders(seller_id,created_at desc);

do $$ declare name text; begin
 foreach name in array array['marketplace_sellers','marketplace_products','marketplace_orders'] loop
  execute format('alter table private.%I enable row level security',name);
  execute format('revoke all on private.%I from public,anon,authenticated',name);
  execute format('create trigger marketplace_touch before update on private.%I for each row execute function private.touch_updated_at()',name);
 end loop;
end $$;

-- A seller is a verified company administrator in an active organization.
create function public.marketplace_seller_apply(p_organization_id uuid,p_name text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;
begin
 perform private.require_permission(p_organization_id,'organization.manage');
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
   or length(btrim(coalesce(p_name,''))) not between 2 and 150
 then raise exception 'Verified account and valid store name required' using errcode='22023'; end if;
 if exists(select 1 from private.marketplace_sellers where organization_id=p_organization_id) then
   raise exception 'Seller application already exists' using errcode='23505'; end if;
 insert into private.marketplace_sellers(organization_id,display_name,applied_by)
 values(p_organization_id,btrim(p_name),auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,'marketplace.seller.applied','marketplace_seller',v_id::text);
 return v_id;
end $fn$;

create function public.marketplace_seller_profile(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.has_permission(p_organization_id,'organization.manage')
   and not private.has_permission(p_organization_id,'catalog.manage')
 then raise exception 'Forbidden' using errcode='42501'; end if;
 return coalesce((
   select jsonb_build_object('id',s.id,'name',s.display_name,'status',s.status,
     'products',coalesce((select jsonb_agg(jsonb_build_object(
       'id',p.id,'industryId',p.industry_id,'sku',p.sku,'name',p.name,
       'category',p.category,'unit',p.unit,'price',p.price,'minQuantity',p.minimum_quantity,
       'currency',p.currency,'status',p.status) order by p.created_at desc)
       from private.marketplace_products p where p.seller_id=s.id),'[]'::jsonb))
   from private.marketplace_sellers s where s.organization_id=p_organization_id
 ),'null'::jsonb);
end $fn$;

create function public.marketplace_sellers_review(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.require_platform('platform.organizations.manage');
 if p_status not in ('pending','approved','rejected','suspended','all') then
  raise exception 'Invalid seller filter' using errcode='22023';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select s.id,s.organization_id as "organizationId",s.display_name as "name",
     s.status,o.name as "company",s.created_at as "createdAt"
   from private.marketplace_sellers s join public.organizations o on o.id=s.organization_id
   where p_status='all' or s.status=p_status order by s.created_at desc limit 100
 ) x),'[]'::jsonb);
end $fn$;

create function public.marketplace_seller_decide(p_seller_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $fn$
declare s private.marketplace_sellers;
begin
 perform private.require_platform('platform.organizations.manage');
 if p_action not in ('approve','reject','suspend') then
   raise exception 'Invalid seller decision' using errcode='22023'; end if;
 select * into s from private.marketplace_sellers where id=p_seller_id for update;
 if not found then raise exception 'Seller unavailable' using errcode='42501'; end if;
 if p_action='approve' and not exists (
   select 1 from public.organizations where id=s.organization_id and status in ('active','trial')
 ) then raise exception 'Inactive organization' using errcode='22023'; end if;
 update private.marketplace_sellers
 set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'suspended' end,
 reviewed_by=auth.uid() where id=p_seller_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),s.organization_id,'marketplace.seller.'||p_action,'marketplace_seller',s.id::text);
end $fn$;

create function public.marketplace_product_save(p_organization_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare s private.marketplace_sellers; v_id uuid; v_industry uuid; v_price numeric;
 v_min numeric; v_currency text; v_name text; v_sku text; v_category text; v_unit text; v_status text;
begin
 perform private.require_permission(p_organization_id,'catalog.manage');
 select * into s from private.marketplace_sellers
 where organization_id=p_organization_id and status='approved' for update;
 if not found then raise exception 'Approved seller required' using errcode='42501'; end if;
 if jsonb_typeof(p_input) is distinct from 'object'
 or octet_length(p_input::text)>4000
 or p_input-array['id','industryId','sku','name','category','unit','price','minQuantity','currency','status']<>'{}'::jsonb
 then raise exception 'Invalid listing payload' using errcode='22023';end if;
 v_industry=(p_input->>'industryId')::uuid;
 v_sku=btrim(coalesce(p_input->>'sku',''));
 v_name=btrim(coalesce(p_input->>'name',''));
 v_category=btrim(coalesce(p_input->>'category',''));
 v_unit=btrim(coalesce(p_input->>'unit',''));
 v_currency=coalesce(p_input->>'currency','');
 v_status=coalesce(p_input->>'status','draft');
 v_price=(p_input->>'price')::numeric;
 v_min=(p_input->>'minQuantity')::numeric;
 if length(v_sku) not between 1 and 64 or length(v_name) not between 2 and 160
 or length(v_category) not between 2 and 100 or length(v_unit) not between 1 and 30
 or v_currency !~ '^[A-Z]{3}$' or v_status not in ('draft','published','archived')
 or v_price is null or v_price<=0 or v_price>100000000000 or round(v_price,2)<>v_price
 or v_min is null or v_min<=0 or round(v_min,3)<>v_min
 or not exists(select 1 from public.industries i
  join public.organization_industries oi on oi.industry_id=i.id
  where i.id=v_industry and i.status='active' and oi.organization_id=p_organization_id)
 then raise exception 'Invalid product or industry' using errcode='22023'; end if;
 if p_input->>'id' is null or p_input->>'id'='' then
   insert into private.marketplace_products(seller_id,industry_id,sku,name,category,unit,price,minimum_quantity,currency,status)
   values(s.id,v_industry,v_sku,v_name,v_category,v_unit,v_price,v_min,v_currency,v_status)
   returning id into v_id;
 else
   v_id=(p_input->>'id')::uuid;
   update private.marketplace_products
     set industry_id=v_industry,sku=v_sku,name=v_name,category=v_category,
         unit=v_unit,price=v_price,minimum_quantity=v_min,currency=v_currency,status=v_status
     where id=v_id and seller_id=s.id;
   if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,'marketplace.product.saved','marketplace_product',v_id::text);
 return v_id;
end $fn$;

-- Only approved sellers with published products and active industries are visible.
-- A buyer requires its own purchasing permission; seller PII is never returned.
create function public.marketplace_catalog(p_organization_id uuid,p_industry_id uuid default null,p_query text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.has_permission(p_organization_id,'purchase.view') then
   raise exception 'Forbidden' using errcode='42501'; end if;
 if length(coalesce(p_query,''))>80 then raise exception 'Query too long' using errcode='22023';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select p.id,p.name,p.sku,p.category,p.unit,p.price,p.minimum_quantity as "minQuantity",
     p.currency,i.id as "industryId",i.name as "industry",s.display_name as "seller",
     s.organization_id as "sellerOrganizationId"
   from private.marketplace_products p
   join private.marketplace_sellers s on s.id=p.seller_id
   join public.organizations o on o.id=s.organization_id
   join public.industries i on i.id=p.industry_id
   where p.status='published' and s.status='approved'
     and o.status in ('active','trial') and i.status='active'
     and (p_industry_id is null or p.industry_id=p_industry_id)
     and (nullif(btrim(p_query),'') is null or p.name ilike '%'||replace(replace(replace(btrim(p_query),'\\',''),'%', ''),'_', '')||'%')
   order by p.created_at desc,p.id desc limit 100
 ) x),'[]'::jsonb);
end $fn$;

-- Price, currency and seller identity are snapshotted atomically on the server.
-- This is a purchase REQUEST; no money is captured and no stock is reserved.
create function public.marketplace_order_place(p_organization_id uuid,p_product_id uuid,p_quantity numeric,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare p private.marketplace_products; s private.marketplace_sellers; b public.organizations;
 v_existing private.marketplace_orders; v_id uuid; v_total numeric;
begin
 perform private.require_permission(p_organization_id,'purchase.manage');
 if p_idempotency_key is null or p_quantity is null
 or p_quantity<=0 or p_quantity>1000000 or round(p_quantity,3)<>p_quantity
 then raise exception 'Invalid quantity or request key' using errcode='22023';end if;
 select * into v_existing from private.marketplace_orders
 where buyer_organization_id=p_organization_id and idempotency_key=p_idempotency_key;
 if found then
   if v_existing.product_id<>p_product_id or v_existing.quantity<>p_quantity then
     raise exception 'Idempotency key already used' using errcode='23505';end if;
   return v_existing.id;
 end if;
 select * into p from private.marketplace_products where id=p_product_id and status='published' for share;
 if not found then raise exception 'Unavailable listing' using errcode='42501';end if;
 select * into s from private.marketplace_sellers where id=p.seller_id and status='approved' for share;
 if not found then raise exception 'Unavailable seller' using errcode='42501';end if;
 select * into b from public.organizations where id=p_organization_id and status in ('active','trial') for share;
 if not found or b.id=s.organization_id or b.default_currency<>p.currency
 or not exists(select 1 from public.organizations where id=s.organization_id and status in ('active','trial'))
 or not exists(select 1 from public.industries where id=p.industry_id and status='active')
 then raise exception 'Unavailable buyer, currency or seller' using errcode='22023';end if;
 if p_quantity<p.minimum_quantity then raise exception 'Below minimum quantity' using errcode='22023';end if;
 v_total=round(p.price*p_quantity,2);
 if v_total>100000000000000 then raise exception 'Order total too high' using errcode='22023';end if;
 insert into private.marketplace_orders(
   buyer_organization_id,seller_id,product_id,quantity,unit_price,total,currency,
   product_name,seller_name,buyer_name,requested_by,idempotency_key)
 values(p_organization_id,s.id,p.id,p_quantity,p.price,v_total,p.currency,
   p.name,s.display_name,b.name,auth.uid(),p_idempotency_key)
 returning id into v_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,'marketplace.order.requested','marketplace_order',v_id::text);
 return v_id;
end $fn$;

create function public.marketplace_orders(p_organization_id uuid,p_role text default 'buyer')
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if p_role='buyer' then
   if not private.has_permission(p_organization_id,'purchase.view') then
     raise exception 'Forbidden' using errcode='42501';end if;
   return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id,product_name as "productName",seller_name as "sellerName",
     buyer_name as "buyerName",quantity,unit_price as "unitPrice",total,currency,status,
     created_at as "createdAt"
    from private.marketplace_orders where buyer_organization_id=p_organization_id
    order by created_at desc limit 100
   ) x),'[]'::jsonb);
 elsif p_role='seller' then
   if not private.has_permission(p_organization_id,'catalog.manage') then
     raise exception 'Forbidden' using errcode='42501';end if;
   return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select o.id,o.product_name as "productName",o.seller_name as "sellerName",
     o.buyer_name as "buyerName",o.quantity,o.unit_price as "unitPrice",
     o.total,o.currency,o.status,o.created_at as "createdAt"
    from private.marketplace_orders o
    join private.marketplace_sellers s on s.id=o.seller_id
    where s.organization_id=p_organization_id
    order by o.created_at desc limit 100
   ) x),'[]'::jsonb);
 else raise exception 'Invalid order role' using errcode='22023';end if;
end $fn$;

create function public.marketplace_order_decide(p_organization_id uuid,p_order_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_order private.marketplace_orders; v_seller private.marketplace_sellers;
begin
 perform private.require_permission(p_organization_id,'catalog.manage');
 if p_action not in ('accept','reject') then raise exception 'Invalid decision' using errcode='22023';end if;
 select * into v_seller from private.marketplace_sellers where organization_id=p_organization_id and status='approved';
 if not found then raise exception 'Approved seller required' using errcode='42501';end if;
 select * into v_order from private.marketplace_orders
  where id=p_order_id and seller_id=v_seller.id for update;
 if not found or v_order.status<>'requested' then
   raise exception 'Pending seller order required' using errcode='42501';end if;
 update private.marketplace_orders set status=case p_action when 'accept' then 'accepted' else 'rejected' end where id=v_order.id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,'marketplace.order.'||p_action,'marketplace_order',v_order.id::text);
end $fn$;

do $$ declare sig text; begin
 foreach sig in array array[
 'marketplace_seller_apply(uuid,text)',
 'marketplace_seller_profile(uuid)',
 'marketplace_sellers_review(text)',
 'marketplace_seller_decide(uuid,text)',
 'marketplace_product_save(uuid,jsonb)',
 'marketplace_catalog(uuid,uuid,text)',
 'marketplace_order_place(uuid,uuid,numeric,uuid)',
 'marketplace_orders(uuid,text)',
 'marketplace_order_decide(uuid,uuid,text)'] loop
  execute format('revoke all on function public.%s from public,anon',sig);
  execute format('grant execute on function public.%s to authenticated',sig);
 end loop;
end $$;
-- Platform operators can expand the marketplace to ANY industry and
-- assign additional industries to a supplier without changing source code.
create function public.marketplace_industry_create(p_key text,p_name text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_key text=lower(btrim(coalesce(p_key,'')));v_name text=btrim(coalesce(p_name,''));
begin
 perform private.require_platform('platform.entitlements.manage');
 if length(v_key) not between 2 and 64 or v_key !~ '^[a-z][a-z0-9_]*
   or length(v_name) not between 2 and 100
 then raise exception 'Invalid industry name or key' using errcode='22023';end if;
 insert into public.industries(key,name,status)
 values(v_key,v_name,'active') returning id into v_id;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'marketplace.industry.created','industry',v_id::text,jsonb_build_object('key',v_key));
 return v_id;
end $fn$;
create function public.marketplace_seller_industry_assign(p_organization_id uuid,p_industry_id uuid)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 perform private.require_platform('platform.organizations.manage');
 if not exists(select 1 from public.organizations where id=p_organization_id and status in ('active','trial'))
   or not exists(select 1 from private.marketplace_sellers where organization_id=p_organization_id)
   or not exists(select 1 from public.industries where id=p_industry_id and status='active')
 then raise exception 'Seller company and active industry required' using errcode='22023';end if;
 insert into public.organization_industries(organization_id,industry_id)
 values(p_organization_id,p_industry_id) on conflict do nothing;
end $fn$;
revoke all on function public.marketplace_industry_create(text,text),
 public.marketplace_seller_industry_assign(uuid,uuid) from public,anon;
grant execute on function public.marketplace_industry_create(text,text),
 public.marketplace_seller_industry_assign(uuid,uuid) to authenticated;
commit;
