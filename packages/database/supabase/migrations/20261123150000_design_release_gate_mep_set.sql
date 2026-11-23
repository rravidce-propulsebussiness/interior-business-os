-- Releasing approved plans for site marking failed on every construction
-- project with "Required latest designs must pass technical review before
-- client acceptance": the live release gate still required a 3D design,
-- while the Plans workflow offers floor plan -> structural -> electrical ->
-- plumbing / MEP and no 3D step. 20261114190000 changes this gate from a
-- five-drawing list, but production still had the original three-drawing
-- list, so that patch never matched there.
-- Bring either form to the intended rule in place: the latest floor plan,
-- structural, electrical and plumbing drawings must each be technically
-- approved and owner-approved. No-op where the rule is already current.
begin;

do $patch$
declare
  definition text;
  current_rule text := $r$else array['architectural_plan','structural_design','electrical_plan','plumbing_plan']::text[] end$r$;
  original_rule text := $r$else array['architectural_plan','3d_design','structural_design']::text[] end$r$;
  five_rule text := $r$else array['architectural_plan','structural_design','3d_design','electrical_plan','plumbing_plan']::text[] end$r$;
  old_review text := $r$select status from private.site_designs d$r$;
  new_review text := $r$select status,client_approved_at from private.site_designs d$r$;
  old_pending text := $r$where latest.status is distinct from 'approved'$r$;
  new_pending text := $r$where latest.status is distinct from 'approved' or latest.client_approved_at is null$r$;
begin
  select pg_get_functiondef('public.project_site_command(uuid,uuid,text,jsonb)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'Missing project_site_command design release gate';
  end if;
  if position(current_rule in definition) > 0 then
    return;
  end if;
  if position(original_rule in definition) > 0 then
    definition := replace(definition, original_rule, current_rule);
  elsif position(five_rule in definition) > 0 then
    definition := replace(definition, five_rule, current_rule);
  else
    raise exception 'Unexpected design release gate drawing list';
  end if;
  if position(new_review in definition) = 0 then
    if position(old_review in definition) = 0 then
      raise exception 'Unexpected design release gate review query';
    end if;
    definition := replace(definition, old_review, new_review);
  end if;
  if position(new_pending in definition) = 0 then
    if position(old_pending in definition) = 0 then
      raise exception 'Unexpected design release gate approval check';
    end if;
    definition := replace(definition, old_pending, new_pending);
  end if;
  execute definition;
end
$patch$;

commit;
