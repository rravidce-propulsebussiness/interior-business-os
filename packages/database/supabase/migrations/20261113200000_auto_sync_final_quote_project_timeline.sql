-- Project milestone rows are planned from the current customer-level Final
-- quotation when the delivery project is created. This does not create a
-- customer acceptance, signed agreement, payment request, or site execution.
-- If an acceptance record exists, it must still match the contracted revision.
do $migration$
declare
  definition text;
  old_gate text := $old$
 if p.id is null or rev.id is null or rev.status not in ('issued','superseded')
   or (c.acceptance_id is not null and not exists(select 1 from public.quotation_customer_responses a
       where a.organization_id=p_org and a.id=c.acceptance_id
         and a.revision_id=rev.id and a.action='approved'))
 then raise exception 'Only an accepted issued quotation can create stages'
      using errcode='42501';end if;
$old$;
  new_gate text := $new$
 if p.id is null or rev.id is null or rev.status not in ('draft','issued')
   or not exists(select 1 from public.quotations q
       where q.organization_id=p_org and q.id=rev.quotation_id
         and q.status in ('draft','issued') and q.current_revision_id=rev.id
         and (public.quotation_final_choices(p_org,array[q.customer_id])->>q.customer_id::text)=q.id::text)
   or (c.acceptance_id is not null and not exists(select 1 from public.quotation_customer_responses a
       where a.organization_id=p_org and a.id=c.acceptance_id
         and a.revision_id=rev.id and a.action='approved'))
 then raise exception 'Only the current customer Final quotation can create planned stages'
      using errcode='42501';end if;
$new$;
begin
  select pg_get_functiondef('public.project_quote_timeline_create(uuid,uuid,jsonb)'::regprocedure)
    into definition;
  if definition is null or position(old_gate in definition)=0 then
    raise exception 'Project quote timeline validation changed; inspect before enabling Final quote planning';
  end if;
  execute replace(definition,old_gate,new_gate);
end
$migration$;
