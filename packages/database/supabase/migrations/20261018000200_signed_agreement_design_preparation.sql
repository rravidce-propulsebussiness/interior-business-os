-- Design preparation follows recorded signing. Advance and payment-schedule
-- gates remain mandatory for physical site execution, invoices and milestones.
-- Do not relax the site_state execution trigger or finance authorization.
BEGIN;
DO $patch$
DECLARE
  definition text;
  previous_guard text;
  design_guard text;
BEGIN
  SELECT pg_get_functiondef('public.project_site_command(uuid,uuid,text,jsonb)'::regprocedure)
    INTO definition;
  previous_guard := $before$if exists(select 1 from private.project_advance_requirements req
       where req.organization_id=p_organization_id and req.project_id=p_project_id)
     and not private.project_agreement_authorized(p_organization_id,p_project_id) then
    raise exception 'Record signed agreement and received advance before starting design'
      using errcode='23514';
  end if;$before$;
  design_guard := $after$if exists(
    select 1 from private.project_advance_requirements req
     where req.organization_id=p_organization_id and req.project_id=p_project_id
  ) and not exists(
    select 1 from public.contracts c
    join private.project_agreement_events event
      on event.organization_id=c.organization_id
      and event.project_id=c.project_id and event.contract_id=c.id
    where c.organization_id=p_organization_id and c.project_id=p_project_id
      and c.status in ('pending','active','on_hold')
      and event.event_kind='signed_copy_recorded'
      and event.scope_fingerprint=private.project_agreement_scope(c.id)
      and event.sequence=(
        select max(latest.sequence)
          from private.project_agreement_events latest
         where latest.organization_id=c.organization_id
           and latest.project_id=c.project_id and latest.contract_id=c.id
      )
  ) then
    raise exception 'Record signed-agreement evidence before preparing design drawings'
      using errcode='23514';
  end if;$after$;
  IF definition IS NULL OR position(previous_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected project_site_command source: review design gate before migration';
  END IF;
  EXECUTE replace(definition,previous_guard,design_guard);
END $patch$;
COMMIT;
