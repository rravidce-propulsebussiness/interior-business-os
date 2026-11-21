-- A BOQ can be created only for a customer-selected Final quotation.
-- The existing quotation_final_choices RPC falls back to the newest quote,
-- which is unsuitable for a new BOQ. This read-only RPC returns pinned
-- selections only, scoped to the authenticated user's organization.
create or replace function public.boq_final_quotation_choices(
  p_org uuid,
  p_customer_ids uuid[]
) returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
begin
  if not private.has_permission(p_org, 'quotation.view') then
    raise exception 'Not authorized to view quotations' using errcode='42501';
  end if;
  if p_customer_ids is null
    or coalesce(array_length(p_customer_ids, 1), 0) > 100 then
    raise exception 'Invalid customer selection' using errcode='22023';
  end if;
  return coalesce((
    select jsonb_object_agg(selection.customer_id::text, selection.quotation_id::text)
    from private.quotation_final_selections selection
    join public.customers customer
      on customer.id = selection.customer_id
     and customer.organization_id = p_org
    join public.quotations quote
      on quote.id = selection.quotation_id
     and quote.organization_id = p_org
     and quote.customer_id = selection.customer_id
     and quote.status in ('draft', 'issued')
    where selection.organization_id = p_org
      and selection.customer_id = any(p_customer_ids)
  ), '{}'::jsonb);
end;
$$;
revoke all on function public.boq_final_quotation_choices(uuid,uuid[]) from public, anon;
grant execute on function public.boq_final_quotation_choices(uuid,uuid[]) to authenticated;

-- Existing BOQs stay editable; never make a second BOQ for the same project,
-- even if the Final quotation changes or a second browser races to create one.
create unique index if not exists construction_boq_documents_one_per_project
  on public.construction_boq_documents (organization_id, project_id)
  where project_id is not null;
