-- Distinguish automatically current/latest quotations from manually approved Final selections.
create or replace function public.quotation_final_marked(p_org uuid,p_customer_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.has_permission(p_org,'quotation.view') then
  raise exception 'Quotation access denied' using errcode='42501';end if;
 if p_customer_ids is null or coalesce(array_length(p_customer_ids,1),0)>100 then
  raise exception 'Invalid customer selection' using errcode='22023';end if;
 return coalesce((
  select jsonb_object_agg(s.customer_id::text,s.quotation_id::text)
  from private.quotation_final_selections s
  join public.quotations q on q.id=s.quotation_id and q.organization_id=s.organization_id
    and q.customer_id=s.customer_id and q.status in ('draft','issued')
  where s.organization_id=p_org and s.customer_id=any(p_customer_ids)
 ),'{}'::jsonb);
end
$f$;
revoke all on function public.quotation_final_marked(uuid,uuid[]) from public,anon;
grant execute on function public.quotation_final_marked(uuid,uuid[]) to authenticated;
