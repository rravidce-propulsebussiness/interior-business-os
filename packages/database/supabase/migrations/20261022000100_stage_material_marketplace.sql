-- Stage materials share Site Delivery requests, canonical stage links and existing marketplace orders.
-- A site request is NOT a marketplace purchase. Purchasing requires separate owner approval.
alter table private.site_material_needs
 add column if not exists marketplace_order_id uuid references private.marketplace_orders(id);

create or replace function public.project_stage_material_batch(
 p_org uuid,p_project uuid,p_stage uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_item jsonb;v_id uuid;v_qty numeric;v_unit text;v_total integer:=0;
begin
 if not private.site_access(p_org,p_project) or
    not private.site_allowed(p_org,p_project,array['manager','site_engineer','procurement'])
 then raise exception 'Project material access denied' using errcode='42501';end if;
 if (select stage from private.site_state where organization_id=p_org and project_id=p_project)
   is distinct from 'execution' then
  raise exception 'Activate construction before requesting materials' using errcode='42501';end if;
 if not exists(select 1 from private.construction_project_stages
    where organization_id=p_org and project_id=p_project and id=p_stage) then
  raise exception 'Construction stage unavailable' using errcode='22023';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 12
   or octet_length(p_items::text)>12000 then
  raise exception 'Choose between 1 and 12 materials' using errcode='22023';end if;
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item) is distinct from 'object'
    or (v_item-array['item','quantity','unit','notes'])<>'{}'::jsonb
    or length(trim(coalesce(v_item->>'item',''))) not between 2 and 200
    or length(coalesce(v_item->>'notes',''))>3000
    or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,9}([.][0-9]{1,3})?$'
  then raise exception 'Invalid material request line' using errcode='22023';end if;
  v_qty=(v_item->>'quantity')::numeric;
  v_unit=v_item->>'unit';
  if v_qty<=0 or v_qty>100000000 or v_unit not in
   ('bags','kg','tonnes','litres','nos','sqft','sqm','cft','cum','yards','metres','feet')
  then raise exception 'Invalid quantity or unit' using errcode='22023';end if;
  insert into private.site_material_needs(
    organization_id,project_id,item,quantity,unit,notes,requested_by)
   values(p_org,p_project,trim(v_item->>'item'),v_qty,v_unit,
    coalesce(v_item->>'notes',''),auth.uid()) returning id into v_id;
  insert into private.construction_stage_record_links(
    organization_id,project_id,stage_id,record_kind,material_id,linked_by)
   values(p_org,p_project,p_stage,'material',v_id,auth.uid());
  perform private.site_log(p_org,p_project,'material.requested',v_id);
  v_total=v_total+1;
 end loop;
 return jsonb_build_object('count',v_total,'stage_id',p_stage);
end
$function$;

-- Places a marketplace seller request for an already-approved site material.
-- Reuses marketplace_order_place (published listings, permissions, pricing snapshot,
-- minimum quantities, currency and idempotency); never fabricates an internal PO.
create or replace function public.project_site_marketplace_order(
 p_org uuid,p_project uuid,p_material uuid,p_product uuid,p_request_key uuid
) returns uuid language plpgsql security definer set search_path='' as $function$
declare v_need private.site_material_needs;v_product private.marketplace_products;
 v_existing private.marketplace_orders;v_order uuid;v_listing_unit text;
begin
 perform private.require_permission(p_org,'purchase.manage');
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
$function$;

-- Seller acceptance is not delivery. Status moves to ordered only after seller
-- accepts, while 'received' still requires a human-verified delivery record.
create or replace function private.site_marketplace_order_status_sync()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if new.status='accepted' and old.status='requested' then
  update private.site_material_needs
     set status='ordered',updated_at=now()
   where marketplace_order_id=new.id and organization_id=new.buyer_organization_id
    and status='approved';
 elsif new.status='rejected' and old.status='requested' then
  update private.site_material_needs
     set vendor_reference='Marketplace request rejected '||new.id::text,
       updated_at=now()
   where marketplace_order_id=new.id and organization_id=new.buyer_organization_id
    and status='approved';
 end if;
 return new;
end
$function$;
drop trigger if exists site_marketplace_order_status_sync on private.marketplace_orders;
create trigger site_marketplace_order_status_sync
 after update of status on private.marketplace_orders
 for each row when (old.status is distinct from new.status)
 execute function private.site_marketplace_order_status_sync();

revoke all on function public.project_stage_material_batch(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.project_stage_material_batch(uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function public.project_site_marketplace_order(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.project_site_marketplace_order(uuid,uuid,uuid,uuid,uuid) to authenticated;
