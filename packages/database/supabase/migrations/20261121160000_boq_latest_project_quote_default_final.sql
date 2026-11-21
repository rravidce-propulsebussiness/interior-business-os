-- BOQ Final quotation: newest SAVED quote for each project by default,
-- with a customer's explicitly pinned Final quotation taking precedence
-- only when that quotation belongs to the same project.
-- An existing BOQ keeps its original revision; no BOQ records are modified.
create or replace function public.boq_effective_project_quotes(
  p_org uuid,
  p_project_ids uuid[]
) returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare
  choices jsonb;
begin
  if not private.has_permission(p_org, 'quotation.view') then
    raise exception 'Not authorized to view quotations' using errcode = '42501';
  end if;
  if p_project_ids is null or coalesce(array_length(p_project_ids, 1), 0) > 500 then
    raise exception 'Invalid project selection' using errcode = '22023';
  end if;

  with eligible as (
    select p.id, p.customer_id
    from public.projects p
    where p.organization_id = p_org
      and p.id = any(p_project_ids)
      and p.customer_id is not null
      and p.is_sales_prospect = false
      and p.removed_from_workspace = false
  ), effective as (
    select p.id as project_id, coalesce(pinned.id, newest.id) as quotation_id
    from eligible p
    left join private.quotation_final_selections selection
      on selection.organization_id = p_org
     and selection.customer_id = p.customer_id
    left join lateral (
      select q.id
      from public.quotations q
      join public.quotation_revisions r
        on r.organization_id = p_org
       and r.id = q.current_revision_id
       and r.status in ('draft', 'issued')
      where q.organization_id = p_org
        and q.id = selection.quotation_id
        and q.project_id = p.id
        and q.customer_id = p.customer_id
        and q.status in ('draft', 'issued')
        and exists (
          select 1 from public.quotation_items i
          where i.organization_id = p_org
            and i.revision_id = q.current_revision_id
        )
      limit 1
    ) pinned on true
    left join lateral (
      select q.id
      from public.quotations q
      join public.quotation_revisions r
        on r.organization_id = p_org
       and r.id = q.current_revision_id
       and r.status in ('draft', 'issued')
      where q.organization_id = p_org
        and q.project_id = p.id
        and q.customer_id = p.customer_id
        and q.status in ('draft', 'issued')
        and exists (
          select 1 from public.quotation_items i
          where i.organization_id = p_org
            and i.revision_id = q.current_revision_id
        )
      order by q.created_at desc, q.id desc
      limit 1
    ) newest on true
  )
  select coalesce(
    jsonb_object_agg(e.project_id::text, e.quotation_id::text),
    '{}'::jsonb
  ) into choices
  from effective e
  where e.quotation_id is not null;

  return choices;
end;
$function$;

revoke all on function public.boq_effective_project_quotes(uuid,uuid[]) from public, anon;
grant execute on function public.boq_effective_project_quotes(uuid,uuid[]) to authenticated;
