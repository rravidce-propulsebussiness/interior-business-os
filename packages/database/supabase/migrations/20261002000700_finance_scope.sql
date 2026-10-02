begin;
create function public.finance_contract_scope(p_organization_id uuid,p_contract_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare c public.contracts;begin
 if not private.finance_access(p_organization_id,'invoice.create') and not private.finance_access(p_organization_id,'change_order.create') then raise exception 'Forbidden' using errcode='42501';end if;
 select * into c from public.contracts where organization_id=p_organization_id and id=p_contract_id;
 if c.id is null then raise exception 'Unavailable contract' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.snapshot->>'name','description',i.description,'area',i.area_snapshot->>'name','contracted_amount',trim_scale(private.contracted_item_amount(c.id,i.id))::text,'already_changed',exists(select 1 from public.change_order_items l join public.change_orders h on h.id=l.change_order_id where h.contract_id=c.id and h.status='approved' and l.original_item_id=i.id)) order by i.sort_order,i.id) from public.quotation_items i where i.revision_id=c.revision_id and not i.optional),'[]');
end$$;
revoke all on function public.finance_contract_scope(uuid,uuid) from public,anon;
grant execute on function public.finance_contract_scope(uuid,uuid) to authenticated;
commit;
