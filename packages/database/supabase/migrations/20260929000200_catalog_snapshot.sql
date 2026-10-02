begin;
-- STABLE single-statement loading provides one MVCC snapshot and preserves caller RLS.
create function public.catalog_snapshot(p_organization_id uuid,p_pricing boolean default false) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.has_permission(p_organization_id,'catalog.view') or not public.has_entitlement(p_organization_id,'catalog') or (p_pricing and (not private.has_permission(p_organization_id,'pricing.view') or not public.has_entitlement(p_organization_id,'pricing'))) then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object(
 'categories',coalesce((select jsonb_agg(t order by sort_order,id) from public.catalog_categories t where organization_id=p_organization_id),'[]'),
 'items',coalesce((select jsonb_agg(t order by sort_order,id) from public.catalog_items t where organization_id=p_organization_id),'[]'),
 'attributes',coalesce((select jsonb_agg(t order by sort_order,id) from public.catalog_item_attributes t where organization_id=p_organization_id),'[]'),
 'options',coalesce((select jsonb_agg(t order by sort_order,id) from public.catalog_attribute_options t where organization_id=p_organization_id),'[]'),
 'books',coalesce((select jsonb_agg(t order by id) from public.price_books t where organization_id=p_organization_id),'[]'),
 'rates',coalesce((select jsonb_agg(t order by id) from public.price_book_items t where organization_id=p_organization_id),'[]'),
 'costs',coalesce((select jsonb_agg(t order by id) from public.pricing_costs t where organization_id=p_organization_id),'[]'),
 'modifiers',coalesce((select jsonb_agg(t order by sort_order,id) from public.pricing_modifiers t where organization_id=p_organization_id),'[]'),
 'units',coalesce((select jsonb_agg(t order by key) from public.units t),'[]'),
 'methods',coalesce((select jsonb_agg(t order by key) from public.measurement_methods t),'[]'),
 'branches',coalesce((select jsonb_agg(t order by id) from public.branches t where organization_id=p_organization_id),'[]'));
end $$;
revoke all on function public.catalog_snapshot(uuid,boolean) from public,anon;
grant execute on function public.catalog_snapshot(uuid,boolean) to authenticated;
alter table public.price_books add constraint finite_book_dates check(isfinite(valid_from) and (valid_until is null or isfinite(valid_until)));
alter table public.price_book_items add constraint finite_rate_dates check(isfinite(valid_from) and (valid_until is null or isfinite(valid_until)));

-- Rate values stay immutable. Explicit soft disable is independently version checked and audited.
create function public.set_rate_status(p_organization_id uuid,p_id uuid,p_version integer,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission(p_organization_id,'pricing.manage');
 if not private.has_permission(p_organization_id,'catalog.view') or not private.has_permission(p_organization_id,'pricing.view') or not private.entitled(p_organization_id,'catalog') or not private.entitled(p_organization_id,'pricing') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_status not in ('active','inactive') then raise exception 'Invalid status' using errcode='22023'; end if;
 update public.price_book_items set status=p_status,version=version+1 where organization_id=p_organization_id and id=p_id and version=p_version;
 if not found then raise exception 'Stale rate' using errcode='40001'; end if;
 perform private.validate_catalog(p_organization_id);
end $$;
revoke all on function public.set_rate_status(uuid,uuid,integer,text) from public,anon;
grant execute on function public.set_rate_status(uuid,uuid,integer,text) to authenticated;
commit;
