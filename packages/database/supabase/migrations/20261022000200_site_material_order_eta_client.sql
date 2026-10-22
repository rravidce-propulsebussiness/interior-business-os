-- One canonical site-material register, scoped delegated ordering and client-safe delivery ETA.
alter table private.site_team add column if not exists can_order_materials boolean not null default false;
alter table private.site_material_needs
 add column if not exists expected_delivery_date date,
 add column if not exists expected_delivery_window text,
 add column if not exists ordered_at timestamptz,
 add column if not exists ordered_by uuid references public.profiles(id),
 add column if not exists received_at timestamptz,
 add column if not exists received_by uuid references public.profiles(id);
alter table private.site_material_needs
 add constraint site_material_delivery_window_check check
 (expected_delivery_window is null or expected_delivery_window in ('morning','afternoon','evening','anytime'));
create index if not exists site_material_eta_index on private.site_material_needs(organization_id,project_id,expected_delivery_date)
 where status='ordered';

create or replace function private.project_material_can_order(p_org uuid,p_project uuid)
returns boolean language sql stable security definer set search_path='' as $f$
 select private.site_access(p_org,p_project) and
 (private.site_is_manager(p_org,p_project) or exists(
   select 1 from private.site_team t
   join public.organization_memberships m on m.organization_id=t.organization_id
       and m.user_id=t.user_id and m.status='active'
   where t.organization_id=p_org and t.project_id=p_project and t.user_id=auth.uid()
     and t.active and t.can_order_materials
 ));
$f$;

create or replace function public.project_material_access_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.site_access(p_org,p_project) then raise exception 'Project unavailable' using errcode='42501';end if;
 return jsonb_build_object(
  'can_order',private.project_material_can_order(p_org,p_project),
  'can_approve',private.site_allowed(p_org,p_project,array['manager','procurement']),
  'grants',case when private.site_is_manager(p_org,p_project) then
    coalesce((select jsonb_agg(jsonb_build_object('user_id',t.user_id,'can_order',t.can_order_materials)
      order by t.user_id) from private.site_team t
      where t.organization_id=p_org and t.project_id=p_project and t.active),'[]'::jsonb)
   else '[]'::jsonb end
 );
end
$f$;

-- Explicit manager delegation. Active construction role or site-team membership required.
create or replace function public.project_material_permission_set(p_org uuid,p_project uuid,p_user uuid,p_allowed boolean)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_role text;v_id uuid;
begin
 if not private.site_is_manager(p_org,p_project) then
  raise exception 'Project owner or manager required' using errcode='42501';end if;
 if p_user is null or p_allowed is null then raise exception 'Invalid permission' using errcode='22023';end if;
 if not exists(select 1 from public.organization_memberships
   where organization_id=p_org and user_id=p_user and status='active') then
  raise exception 'Active company employee required' using errcode='42501';end if;
 perform 1 from public.projects where id=p_project and organization_id=p_org for update;
 select t.role into v_role from private.site_team t
  where t.organization_id=p_org and t.project_id=p_project and t.user_id=p_user and t.active;
 if v_role is null then
  select case when r.role='procurement' then 'procurement' else 'site_engineer' end
    into v_role from private.construction_project_roles r
   where r.organization_id=p_org and r.project_id=p_project and r.user_id=p_user
    and r.active and r.role in ('site_engineer','project_manager','procurement','supervisor')
   order by case when r.role='procurement' then 0 else 1 end limit 1;
 end if;
 if v_role not in ('manager','procurement','site_engineer') then
  raise exception 'Assign an active site engineer or procurement role first' using errcode='42501';end if;
 insert into private.site_team(organization_id,project_id,user_id,role,active,can_order_materials)
 values(p_org,p_project,p_user,v_role,true,p_allowed)
 on conflict(organization_id,project_id,user_id)
 do update set can_order_materials=excluded.can_order_materials,
    active=true
 returning id into v_id;
 perform private.site_log(p_org,p_project,
   case when p_allowed then 'material.order_permission.granted'
        else 'material.order_permission.revoked' end,v_id);
 return jsonb_build_object('saved',true);
end
$f$;

-- Record real outside ordering, revise expected delivery, or confirm physical arrival.
-- Approved demand is distinct from an actual placed order.
create or replace function public.project_material_delivery_command(
 p_org uuid,p_project uuid,p_material uuid,p_action text,
 p_reference text default null,p_expected_date date default null,
 p_window text default null
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_item private.site_material_needs;v_today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if not private.site_access(p_org,p_project) or
   (select stage from private.site_state where organization_id=p_org and project_id=p_project)
    is distinct from 'execution'
 then raise exception 'Active site access required' using errcode='42501';end if;
 if p_action not in ('place_outside_order','update_eta','confirm_received') then
   raise exception 'Unknown material action' using errcode='22023';end if;
 if p_action='confirm_received' then
  if not (private.site_allowed(p_org,p_project,array['manager','site_engineer','procurement'])
       or private.project_material_can_order(p_org,p_project)) then
   raise exception 'Site receipt confirmation requires a site role' using errcode='42501';end if;
 elsif not private.project_material_can_order(p_org,p_project) then
  raise exception 'Material-order permission required' using errcode='42501';end if;
 perform 1 from public.projects where id=p_project and organization_id=p_org for update;
 select * into v_item from private.site_material_needs
  where organization_id=p_org and project_id=p_project and id=p_material for update;
 if not found then raise exception 'Material request not found' using errcode='22023';end if;
 if p_action='place_outside_order' then
  if v_item.status<>'approved' then raise exception 'Approve material before ordering' using errcode='23514';end if;
  if v_item.source='marketplace' and v_item.marketplace_order_id is not null and
     exists(select 1 from private.marketplace_orders o where o.id=v_item.marketplace_order_id
      and o.status in ('requested','accepted')) then
    raise exception 'Existing marketplace order must finish first' using errcode='23514';end if;
  if length(trim(coalesce(p_reference,''))) not between 3 and 500 then
   raise exception 'Actual outside supplier or order reference is required' using errcode='22023';end if;
 elsif p_action='update_eta' then
  if v_item.status<>'ordered' then raise exception 'Only ordered materials have a delivery estimate' using errcode='23514';end if;
 else
  if v_item.status<>'ordered' then raise exception 'Only ordered material may be received' using errcode='23514';end if;
 end if;
 if p_action in ('place_outside_order','update_eta') then
  if p_expected_date is null or p_expected_date<v_today or p_expected_date>v_today+365
    or p_window not in ('morning','afternoon','evening','anytime')
  then raise exception 'Choose a delivery date and time window' using errcode='22023';end if;
 end if;
 if p_action='place_outside_order' then
  update private.site_material_needs set status='ordered',source='outside',
    vendor_reference=trim(p_reference),ordered_at=now(),ordered_by=auth.uid(),
    expected_delivery_date=p_expected_date,expected_delivery_window=p_window,updated_at=now()
   where id=p_material and organization_id=p_org and project_id=p_project;
 elsif p_action='update_eta' then
  update private.site_material_needs set expected_delivery_date=p_expected_date,
   expected_delivery_window=p_window,updated_at=now()
   where id=p_material and organization_id=p_org and project_id=p_project;
 else
  update private.site_material_needs set status='received',
   received_at=now(),received_by=auth.uid(),updated_at=now()
   where id=p_material and organization_id=p_org and project_id=p_project;
 end if;
 perform private.site_log(p_org,p_project,'material.'||p_action,p_material);
 return jsonb_build_object('saved',true);
end
$f$;

-- Site requests use the same project scoped data. No supplier, price, margin,
-- order keys or internal permission data is exposed to the client.
create or replace function public.client_portal_site_materials(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_org uuid;v_today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if auth.uid() is null or not private.client_portal_accessible(p_project_id)
 then raise exception 'Project not shared with this account' using errcode='42501';end if;
 select organization_id into v_org from public.projects where id=p_project_id;
 if v_org is null then raise exception 'Project unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_time desc)
 from (
  select x.item as description,x.unit,x.quantity::text as ordered_quantity,
    null::text as po_number,x.expected_delivery_date::text as expected_date,
    x.expected_delivery_window as expected_window,
    x.updated_at as sort_time,
    case when x.status='received' then 'delivered'
         when x.status='ordered' and x.expected_delivery_date<v_today then 'overdue'
         else x.status end as status,
    case when x.received_at is not null then
      (x.received_at at time zone 'Asia/Kolkata')::date::text else null end as received_date
  from private.site_material_needs x
  where x.organization_id=v_org and x.project_id=p_project_id
    and x.status in ('requested','approved','ordered','received')
  order by x.updated_at desc limit 60
 ) m),'[]'::jsonb);
end
$f$;
revoke all on function public.project_material_access_read(uuid,uuid) from public,anon;
revoke all on function public.project_material_permission_set(uuid,uuid,uuid,boolean) from public,anon;
revoke all on function public.project_material_delivery_command(uuid,uuid,uuid,text,text,date,text) from public,anon;
revoke all on function public.client_portal_site_materials(uuid) from public,anon;
grant execute on function public.project_material_access_read(uuid,uuid) to authenticated;
grant execute on function public.project_material_permission_set(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.project_material_delivery_command(uuid,uuid,uuid,text,text,date,text) to authenticated;
grant execute on function public.client_portal_site_materials(uuid) to authenticated;
