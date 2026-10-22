-- Keep project-specific ordering permission mandatory even for marketplace orders.
CREATE OR REPLACE FUNCTION public.project_site_marketplace_order(p_org uuid, p_project uuid, p_material uuid, p_product uuid, p_request_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_need private.site_material_needs;v_product private.marketplace_products;
 v_existing private.marketplace_orders;v_order uuid;v_listing_unit text;
begin
 perform private.require_permission(p_org,'purchase.manage');
 if not private.project_material_can_order(p_org,p_project) then
  raise exception 'Project-specific ordering permission required' using errcode='42501';end if;
 if not private.site_access(p_org,p_project) then
  raise exception 'Project purchase unavailable' using errcode='42501';end if;
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;
 select * into v_need from private.site_material_needs
  where organization_id=p_org and project_id=p_project and id=p_material for update;
 if not found or v_need.status not in ('approved','ordered') then
  raise exception 'Approve this material request before marketplace ordering' using errcode='23514';end if;
 if v_need.marketplace_order_id is not null then
  select * into v_existing from private.marketplace_orders
   where id=v_need.marketplace_order_id and buyer_organization_id=p_org;
  if found and v_existing.status in ('requested','accepted') then
   if v_existing.product_id<>p_product or v_existing.quantity<>v_need.quantity
   then raise exception 'This material already has an active seller request' using errcode='23505';end if;
   return v_existing.id;
  end if;
 end if;
 select * into v_product from private.marketplace_products where id=p_product and status='published';
 if not found then raise exception 'Published marketplace listing required' using errcode='22023';end if;
 v_listing_unit=lower(trim(v_product.unit));
 v_listing_unit=case v_listing_unit
  when 'ton' then 'tonnes' when 'mt' then 'tonnes' when 'tonne' then 'tonnes'
  when 'liter' then 'litres' when 'litre' then 'litres'
  when 'piece' then 'nos' when 'pieces' then 'nos' when 'number' then 'nos'
  when 'unit' then 'nos' when 'units' then 'nos' when 'pcs' then 'nos'
  when 'bag' then 'bags' when 'kilogram' then 'kg' when 'kilograms' then 'kg'
  when 'square feet' then 'sqft' when 'square foot' then 'sqft'
  when 'square meters' then 'sqm' when 'square metres' then 'sqm'
  when 'cubic feet' then 'cft' when 'cubic foot' then 'cft'
  when 'cubic meters' then 'cum' when 'cubic metres' then 'cum'
  when 'meter' then 'metres' when 'meters' then 'metres' when 'metre' then 'metres'
  when 'foot' then 'feet' when 'yard' then 'yards'
  else v_listing_unit end;
 if v_need.unit<>v_listing_unit then raise exception 'Listing and request units differ; conversion must be recorded before ordering' using errcode='23514';end if;
 if v_need.quantity>1000000 or v_need.quantity<v_product.minimum_quantity then
  raise exception 'Quantity outside marketplace listing limits' using errcode='22023';end if;
 v_order=public.marketplace_order_place(p_org,p_product,v_need.quantity,p_request_key);
 update private.site_material_needs
  set marketplace_order_id=v_order,source='marketplace',
   vendor_reference='Marketplace request '||v_order::text,updated_at=now()
  where organization_id=p_org and project_id=p_project and id=p_material;
 perform private.site_log(p_org,p_project,'material.marketplace_requested',p_material);
 return v_order;
end
$function$
;

-- Forbid status shortcuts through the legacy general site command.
-- Material requests are ordered only by a real accepted marketplace order or
-- by an authorized person recording supplier, ETA and ordering timestamp.
create or replace function private.site_material_delivery_transition_guard()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 if old.status is distinct from new.status then
   if new.status='ordered' then
     if new.source='outside' then
       if new.ordered_by is null or new.ordered_at is null
         or new.expected_delivery_date is null
         or new.expected_delivery_window is null
         or length(trim(coalesce(new.vendor_reference,'')))<3
       then raise exception 'Record an authorized outside order and delivery estimate before marking ordered' using errcode='23514';end if;
     elsif new.source='marketplace' then
       if new.marketplace_order_id is null or not exists(
         select 1 from private.marketplace_orders o where o.id=new.marketplace_order_id
         and o.buyer_organization_id=new.organization_id and o.status='accepted'
       ) then raise exception 'Marketplace seller must accept the order first' using errcode='23514';end if;
     else raise exception 'Ordering source must be confirmed' using errcode='23514';end if;
   elsif new.status='received' then
     if new.received_at is null or new.received_by is null then
       raise exception 'Record actual site receipt before marking delivered' using errcode='23514';end if;
   end if;
 end if;
 return new;
end
$guard$;
drop trigger if exists site_material_delivery_transition_guard on private.site_material_needs;
create trigger site_material_delivery_transition_guard
 before update of status on private.site_material_needs
 for each row when (old.status is distinct from new.status)
 execute function private.site_material_delivery_transition_guard();
