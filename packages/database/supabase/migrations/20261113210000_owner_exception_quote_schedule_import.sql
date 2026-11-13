-- Owner use of the current Final quotation is a valid agreement-clearance
-- choice. Permit the canonical quote-schedule importer to use that event,
-- while still requiring it to be the latest event for the current scope.
begin;

do $patch$
declare
  definition text;
  old_guard text := $before$
      AND e.contract_id=c.id AND e.event_kind='signed_copy_recorded'
$before$;
  new_guard text := $after$
      AND e.contract_id=c.id AND e.event_kind IN ('signed_copy_recorded','owner_exception')
$after$;
begin
  select pg_get_functiondef(
    'private.sync_signed_quotation_schedule(uuid,uuid)'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'Unexpected quotation schedule agreement guard';
  elsif position(old_guard in definition)>0 then
    definition := replace(definition,old_guard,new_guard);
  elsif position(new_guard in definition)=0 then
    raise exception 'Unexpected quotation schedule agreement guard';
  end if;

  -- The importer is SECURITY DEFINER. Do not call the permission-checked
  -- customer-facing quotation lookup from a migration/backfill context.
  -- Read the private selection directly and preserve its newest-quote fallback.
  old_guard := $before$AND (public.quotation_final_choices(p_org,ARRAY[q.customer_id])->>q.customer_id::text)=q.id::text$before$;
  new_guard := $after$AND q.id=coalesce(
          (select pinned.id
             from private.quotation_final_selections selection
             join public.quotations pinned
               on pinned.organization_id=selection.organization_id
              and pinned.id=selection.quotation_id
              and pinned.customer_id=selection.customer_id
              and pinned.status in ('draft','issued')
            where selection.organization_id=p_org
              and selection.customer_id=q.customer_id),
          (select newest.id
             from public.quotations newest
            where newest.organization_id=p_org
              and newest.customer_id=q.customer_id
              and newest.status in ('draft','issued')
            order by newest.created_at desc,newest.id desc
            limit 1))$after$;
  if position(old_guard in definition)>0 then
    definition := replace(definition,old_guard,new_guard);
  elsif position(new_guard in definition)=0 then
    raise exception 'Unexpected quotation Final selection guard';
  end if;
  execute definition;
end
$patch$;

-- Retry only active contracts whose latest owner choice still matches their
-- current immutable scope. The canonical importer is idempotent and leaves
-- manual or existing quotation schedules unchanged.
do $backfill$
declare
  v_contract record;
begin
  for v_contract in
    select c.organization_id,c.id
      from public.contracts c
      join lateral (
        select e.event_kind,e.scope_fingerprint
          from private.project_agreement_events e
         where e.organization_id=c.organization_id
           and e.project_id=c.project_id and e.contract_id=c.id
         order by e.sequence desc limit 1
      ) latest on true
     where c.status='active'
       and latest.event_kind='owner_exception'
       and latest.scope_fingerprint=private.project_agreement_scope(c.id)
  loop
    perform private.sync_signed_quotation_schedule(v_contract.organization_id,v_contract.id);
  end loop;
end
$backfill$;

commit;
