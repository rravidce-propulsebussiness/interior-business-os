-- Only authorized company owners may self-review the quality decision.
-- Project managers, site engineers, and unassigned users are not elevated.
-- Structural reviews still require the designated structural engineer.
DO $migration$
DECLARE fn text;
BEGIN
 SELECT pg_get_functiondef('public.construction_quality_command(uuid,uuid,text,jsonb)'::regprocedure) INTO fn;
 IF position('Independently assigned reviewer role required' IN fn)=0
    OR position('Work performer cannot certify their own stage' IN fn)=0 THEN
   RAISE EXCEPTION 'Unexpected existing stage quality approval rules';
 END IF;
 fn := replace(fn,
  'if not exists(select 1 from private.construction_project_roles role' || chr(10) ||
  '       where role.organization_id=p_org and role.project_id=p_project',
  'if not (kind=''quality'' and private.site_owner(p_org))' || chr(10) ||
  '       and not exists(select 1 from private.construction_project_roles role' || chr(10) ||
  '       where role.organization_id=p_org and role.project_id=p_project');
 fn := replace(fn,
  '        and st.stage_id=stage.id and task.assigned_to=actor)' || chr(10) ||
  '    then raise exception ''Work performer cannot certify their own stage''',
  '        and st.stage_id=stage.id and task.assigned_to=actor)' || chr(10) ||
  '       and not (kind=''quality'' and private.site_owner(p_org))' || chr(10) ||
  '    then raise exception ''Non-owner cannot certify their own stage''');
 fn := replace(fn, 'Independently assigned reviewer role required',
                     'Company owner or assigned quality reviewer required');
 fn := replace(fn, 'Latest independent quality review must approve',
                     'Latest authorized company quality review must approve');
 EXECUTE fn;
END
$migration$;
