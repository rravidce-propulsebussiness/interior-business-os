-- Expose activity_index from the existing project site reader.
CREATE OR REPLACE FUNCTION public.project_site_read(p_organization_id uuid, p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;manager boolean;result jsonb;begin
 if not private.site_access(p_organization_id,p_project_id) then
  raise exception 'Project workspace unavailable' using errcode='42501';
 end if;
 v_role=private.site_role(p_organization_id,p_project_id);
 manager=private.site_is_manager(p_organization_id,p_project_id);
 select jsonb_build_object(
  'project',jsonb_build_object('id',p.id,'name',p.name,'code',p.code,'status',p.status),
  'stage',coalesce(s.stage,'not_started'),
  'approval_evidence',case when manager then coalesce(s.approval_evidence,'') else '' end,
  'client_approval_recorded_at',s.client_approval_recorded_at,
  'role',case when manager then 'manager' else v_role end,
  'can_manage',manager,
  'team',case when manager then coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from
    (select id,user_id,role,active,created_at from private.site_team where organization_id=p_organization_id and project_id=p_project_id) t),'[]'::jsonb) else '[]'::jsonb end,
  'member_options',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'label',coalesce(nullif(trim(pr.full_name),''),left(m.user_id::text,8))) order by pr.full_name,m.user_id) from public.organization_memberships m join public.profiles pr on pr.id=m.user_id where m.organization_id=p_organization_id and m.status='active'),'[]'::jsonb) else '[]'::jsonb end,
  'designs',case when manager or v_role in ('architect','structural_designer','site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id desc) from (select id,kind,revision,reference,notes,status,review_note,submitted_by,created_at from private.site_designs where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 60)d),'[]'::jsonb) else '[]'::jsonb end,
  'reports',case when manager or v_role in ('site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.report_date desc,d.created_at desc) from (select id,report_date,completed_work,tomorrow_plan,blockers,worker_count,tomorrow_workers,checks_done,checks_required,created_at from private.site_reports where organization_id=p_organization_id and project_id=p_project_id order by report_date desc,created_at desc limit 40)d),'[]'::jsonb) else '[]'::jsonb end,
  'materials',case when manager or v_role in ('site_engineer','procurement') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,activity_index,item,quantity,unit,source,status,vendor_reference,notes,created_at from private.site_material_needs where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 70)d),'[]'::jsonb) else '[]'::jsonb end,
  'checks',case when manager or v_role in ('site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,title,due_date,status,notes,checked_at,created_at from private.site_checks where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 70)d),'[]'::jsonb) else '[]'::jsonb end,
  'gate',case when manager or v_role in ('watchman','site_engineer') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,kind,description,notes,created_at from private.site_gate where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 40)d),'[]'::jsonb) else '[]'::jsonb end,
  'media',case when manager or v_role in ('architect','structural_designer','site_engineer','quality_inspector','watchman') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,filename,mime,category,caption,uploaded_by,created_at from private.site_media where organization_id=p_organization_id and project_id=p_project_id and (category<>'agreement' or (manager and private.finance_access(p_organization_id,'contract.view')))
      and (manager or v_role<>'watchman' or (category='curing' and uploaded_by=auth.uid())) order by created_at desc limit 60)d),'[]'::jsonb) else '[]'::jsonb end,
  'events',case when manager then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select actor_id,action,created_at from private.site_events where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 30)d),'[]'::jsonb) else '[]'::jsonb end
 ) into result from public.projects p left join private.site_state s on s.organization_id=p_organization_id and s.project_id=p.id where p.organization_id=p_organization_id and p.id=p_project_id;
 return result;
end$function$;
