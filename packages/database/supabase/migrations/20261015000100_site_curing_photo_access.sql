-- Private curing photos: watchmen may document their own curing rounds, never
-- receive design files, financial documents or general work uploads.
-- Build on canonical Site Delivery media storage and project-level authorization.
begin;

alter table private.site_media drop constraint if exists site_media_category_check;
alter table private.site_media add constraint site_media_category_check
 check (category in ('design','daily','site','inspection','agreement','curing'));

create or replace function public.project_site_read(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  'reports',case when manager or v_role in ('site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.report_date desc,d.created_at desc) from (select id,report_date,completed_work,tomorrow_plan,blockers,worker_count,checks_done,checks_required,created_at from private.site_reports where organization_id=p_organization_id and project_id=p_project_id order by report_date desc,created_at desc limit 40)d),'[]'::jsonb) else '[]'::jsonb end,
  'materials',case when manager or v_role in ('site_engineer','procurement') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,item,quantity,unit,source,status,vendor_reference,notes,created_at from private.site_material_needs where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 70)d),'[]'::jsonb) else '[]'::jsonb end,
  'checks',case when manager or v_role in ('site_engineer','quality_inspector') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,title,due_date,status,notes,checked_at,created_at from private.site_checks where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 70)d),'[]'::jsonb) else '[]'::jsonb end,
  'gate',case when manager or v_role in ('watchman','site_engineer') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,kind,description,notes,created_at from private.site_gate where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 40)d),'[]'::jsonb) else '[]'::jsonb end,
  'media',case when manager or v_role in ('architect','structural_designer','site_engineer','quality_inspector','watchman') then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select id,filename,mime,category,caption,uploaded_by,created_at from private.site_media where organization_id=p_organization_id and project_id=p_project_id and (category<>'agreement' or (manager and private.finance_access(p_organization_id,'contract.view')))
      and (manager or v_role<>'watchman' or (category='curing' and uploaded_by=auth.uid())) order by created_at desc limit 60)d),'[]'::jsonb) else '[]'::jsonb end,
  'events',case when manager then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select actor_id,action,created_at from private.site_events where organization_id=p_organization_id and project_id=p_project_id order by created_at desc limit 30)d),'[]'::jsonb) else '[]'::jsonb end
 ) into result from public.projects p left join private.site_state s on s.organization_id=p_organization_id and s.project_id=p.id where p.organization_id=p_organization_id and p.id=p_project_id;
 return result;
end$$;

create or replace function public.project_site_media_put(p_organization_id uuid,p_project_id uuid,p_category text,p_filename text,p_mime text,p_base64 text,p_caption text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_bytes bytea;v_stage text;begin
 if not private.site_allowed(p_organization_id,p_project_id,array['manager','architect','structural_designer','site_engineer','quality_inspector','watchman']) then raise exception 'Media access denied' using errcode='42501';end if;
 if p_category not in ('design','daily','site','inspection','agreement','curing') or p_mime not in ('image/jpeg','image/png','image/webp','video/mp4','application/pdf')
 or length(p_filename) not between 1 and 180 or (position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 or p_filename ~ '[[:cntrl:]]') or length(coalesce(p_caption,''))>500 or length(p_base64)>11500000 then raise exception 'Invalid media' using errcode='22023';end if;
 select stage into v_stage from private.site_state where project_id=p_project_id and organization_id=p_organization_id;
 if p_category='agreement' then
  if p_mime<>'application/pdf'
    or not private.construction_can_manage(p_organization_id,p_project_id)
    or not private.finance_access(p_organization_id,'contract.manage')
  then raise exception 'Private agreement PDF requires authorized commercial project manager' using errcode='42501';end if;
 else
  if v_stage is null or (v_stage='design' and p_category<>'design') or (v_stage='execution' and p_category='design') or v_stage not in ('design','execution') then raise exception 'Media not permitted in this phase' using errcode='42501';end if;
 end if;
 if p_category='design' and not private.site_allowed(p_organization_id,p_project_id,array['manager','architect','structural_designer']) then raise exception 'Design role required' using errcode='42501';end if;
 if p_category not in ('design','agreement','curing') and not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','quality_inspector']) then raise exception 'Site role required' using errcode='42501';end if;
 if p_category='curing' then
   if p_mime not in ('image/jpeg','image/png','image/webp')
     or length(trim(coalesce(p_caption,'')))<5
     or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','watchman'])
   then raise exception 'Curing evidence needs an authorized role, a photo and a descriptive caption' using errcode='42501'; end if;
   if private.site_role(p_organization_id,p_project_id)='watchman'
     and not private.site_is_manager(p_organization_id,p_project_id)
     and not exists (
       select 1 from private.site_gate g
       where g.organization_id=p_organization_id and g.project_id=p_project_id
         and g.kind='curing' and g.created_by=auth.uid()
         and g.created_at>=now()-interval '24 hours'
     )
   then raise exception 'Record a curing round before uploading its photo' using errcode='23514'; end if;
 end if;
 if p_category<>'curing' and private.site_role(p_organization_id,p_project_id)='watchman'
    and not private.site_is_manager(p_organization_id,p_project_id)
 then raise exception 'Watchman may only upload curing photos' using errcode='42501'; end if;
 if (select count(*) from private.site_media where organization_id=p_organization_id and project_id=p_project_id)>=150 then raise exception 'Project media count limit reached' using errcode='23514';end if;
 v_bytes=decode(p_base64,'base64');
 if octet_length(v_bytes) not between 1 and 8388608 then raise exception 'Maximum file size 8 MB' using errcode='23514';end if;
 if (p_mime='image/jpeg' and (get_byte(v_bytes,0)<>255 or get_byte(v_bytes,1)<>216))
    or (p_mime='image/png' and substring(v_bytes from 1 for 4)<>decode('89504e47','hex'))
    or (p_mime='image/webp' and substring(v_bytes from 1 for 4)<>convert_to('RIFF','UTF8'))
    or (p_mime='video/mp4' and substring(v_bytes from 5 for 4)<>convert_to('ftyp','UTF8'))
    or (p_mime='application/pdf' and substring(v_bytes from 1 for 4)<>convert_to('%PDF','UTF8'))
 then raise exception 'File signature does not match type' using errcode='22023';end if;
 insert into private.site_media(organization_id,project_id,filename,mime,bytes,caption,category,uploaded_by)
 values(p_organization_id,p_project_id,p_filename,p_mime,v_bytes,coalesce(p_caption,''),p_category,auth.uid()) returning id into v_id;
 perform private.site_log(p_organization_id,p_project_id,'media.uploaded',v_id);
 return v_id;
end$$;

create or replace function public.project_site_media_get(p_organization_id uuid,p_project_id uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m private.site_media;role text;begin
 if not private.site_access(p_organization_id,p_project_id) then raise exception 'Media not available' using errcode='42501';end if;
 role=private.site_role(p_organization_id,p_project_id);
 if not private.site_is_manager(p_organization_id,p_project_id) and role not in ('manager','architect','structural_designer','site_engineer','quality_inspector','watchman') then raise exception 'Media not available' using errcode='42501';end if;
 select * into m from private.site_media where organization_id=p_organization_id and project_id=p_project_id and id=p_id;
 if m.id is null then raise exception 'Media not found' using errcode='42501';end if;
 if role='watchman' and not private.site_is_manager(p_organization_id,p_project_id)
   and (m.category<>'curing' or m.uploaded_by<>auth.uid())
 then raise exception 'Curing photo not available to this watchman' using errcode='42501';end if;
 if m.category='agreement' and (
    not private.construction_can_manage(p_organization_id,p_project_id)
    or not private.finance_access(p_organization_id,'contract.view')
 ) then raise exception 'Agreement media restricted' using errcode='42501';end if;
 if m.category='design' and role in ('watchman','procurement') and not private.site_is_manager(p_organization_id,p_project_id) then raise exception 'Media not permitted' using errcode='42501';end if;
 if m.category<>'design' and role in ('architect','structural_designer') and not private.site_is_manager(p_organization_id,p_project_id) then raise exception 'Media not permitted' using errcode='42501';end if;
 return jsonb_build_object('filename',m.filename,'mime',m.mime,'base64',encode(m.bytes,'base64'));
end$$;

-- Existing execute grants and revoked direct private-table access remain in force.
commit;
