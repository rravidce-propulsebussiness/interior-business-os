-- Record customer-requested design revisions without falsely approving
-- drawings, and support interior-specific mandatory drawings.
begin;
alter table private.site_designs drop constraint if exists site_designs_kind_check;
alter table private.site_designs add constraint site_designs_kind_check
 check(kind in('architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan'));
CREATE OR REPLACE FUNCTION public.project_site_command(p_organization_id uuid, p_project_id uuid, p_action text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stage text;v_role text;v_id uuid;v_kind text;v_revision integer;v_status text;v_member uuid;v_source text;v_row private.site_designs;v_evidence text;begin
 if not private.site_access(p_organization_id,p_project_id) then raise exception 'Project unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16000 then raise exception 'Invalid input' using errcode='22023';end if;
 -- Serialize all site transitions/approvals on the canonical project row.
 perform 1 from public.projects where organization_id=p_organization_id and id=p_project_id for update;
 select stage into v_stage from private.site_state where organization_id=p_organization_id and project_id=p_project_id;
 v_role=private.site_role(p_organization_id,p_project_id);
 if p_action='initialize' then
  if not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager required' using errcode='42501';end if;
  insert into private.site_state(organization_id,project_id) values(p_organization_id,p_project_id) on conflict(project_id) do nothing;
  perform private.site_log(p_organization_id,p_project_id,'site.initialized');
 elsif p_action='assign' then
  if not private.site_allowed(p_organization_id,p_project_id,array['manager']) or v_stage is null then raise exception 'Manager required' using errcode='42501';end if;
  if p_input-array['user_id','role','active']<>'{}'::jsonb then raise exception 'Invalid assignment' using errcode='22023';end if;
  v_member=(p_input->>'user_id')::uuid;
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=v_member and status='active') then raise exception 'Active member required' using errcode='42501';end if;
  if coalesce(p_input->>'role','') not in ('manager','architect','structural_designer','site_engineer','watchman','quality_inspector','procurement') then raise exception 'Invalid role' using errcode='22023';end if;
  insert into private.site_team(organization_id,project_id,user_id,role,active) values(p_organization_id,p_project_id,v_member,p_input->>'role',coalesce((p_input->>'active')::boolean,true))
  on conflict(organization_id,project_id,user_id) do update set role=excluded.role,active=excluded.active
  returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'team.assigned',v_id);
 elsif p_action='design_submit' then
  if exists(select 1 from private.project_advance_requirements req
       where req.organization_id=p_organization_id and req.project_id=p_project_id)
     and not private.project_agreement_authorized(p_organization_id,p_project_id) then
    raise exception 'Record signed agreement and received advance before starting design'
      using errcode='23514';
  end if;
  if v_stage is distinct from 'design' or not private.site_allowed(p_organization_id,p_project_id,array['architect','structural_designer','manager']) then raise exception 'Design phase required' using errcode='42501';end if;
  if p_input-array['kind','reference','notes']<>'{}'::jsonb then raise exception 'Invalid design input' using errcode='22023';end if;
  v_kind=p_input->>'kind';
  if v_kind not in ('architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan') or (v_role='structural_designer' and v_kind<>'structural_design' and not private.site_is_manager(p_organization_id,p_project_id)) or (v_role='architect' and v_kind='structural_design' and not private.site_is_manager(p_organization_id,p_project_id)) then raise exception 'Design role mismatch' using errcode='42501';end if;
  if length(trim(coalesce(p_input->>'reference',''))) not between 6 and 1500 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid design reference' using errcode='22023';end if;
  if exists(select 1 from private.site_designs where organization_id=p_organization_id and project_id=p_project_id and kind=v_kind and status='submitted') then raise exception 'Review current design before revising' using errcode='23514';end if;
  select coalesce(max(revision),0)+1 into v_revision from private.site_designs where organization_id=p_organization_id and project_id=p_project_id and kind=v_kind;
  insert into private.site_designs(organization_id,project_id,kind,revision,reference,notes,submitted_by)
  values(p_organization_id,p_project_id,v_kind,v_revision,trim(p_input->>'reference'),coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'design.submitted',v_id);
 elsif p_action='design_decide' then
  if v_stage is distinct from 'design' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager review required' using errcode='42501';end if;
  if p_input-array['id','decision','note']<>'{}'::jsonb then raise exception 'Invalid design review' using errcode='22023';end if;
  v_status=p_input->>'decision';
  if v_status not in ('approved','changes_requested') then raise exception 'Invalid review decision' using errcode='22023';end if;
  select * into v_row from private.site_designs where organization_id=p_organization_id and project_id=p_project_id and id=(p_input->>'id')::uuid for update;
  if v_row.id is null or v_row.status<>'submitted' or length(coalesce(p_input->>'note',''))>3000 then raise exception 'Pending design required' using errcode='23514';end if;
  if v_status='changes_requested' and length(trim(coalesce(p_input->>'note','')))<5 then raise exception 'Explain required changes' using errcode='22023';end if;
  update private.site_designs set status=v_status,reviewed_by=auth.uid(),reviewed_at=now(),review_note=coalesce(p_input->>'note','') where id=v_row.id;
  v_id=v_row.id; perform private.site_log(p_organization_id,p_project_id,'design.'||v_status,v_id);
 elsif p_action='client_changes' then
  if v_stage is distinct from 'design' or not private.site_allowed(p_organization_id,p_project_id,array['manager'])
  then raise exception 'Manager must record client design requests' using errcode='42501';end if;
  if p_input-array['kind','note','evidence']<>'{}'::jsonb then raise exception 'Invalid client changes payload' using errcode='22023';end if;
  v_kind=p_input->>'kind';
  if v_kind not in ('architectural_plan','3d_design','structural_design','interior_layout','electrical_plan','plumbing_plan') then raise exception 'Invalid drawing type' using errcode='22023';end if;
  if length(trim(coalesce(p_input->>'note',''))) not between 10 and 3000
    or length(trim(coalesce(p_input->>'evidence',''))) not between 10 and 3000
  then raise exception 'Customer changes and evidence must be documented' using errcode='22023';end if;
  select * into v_row from private.site_designs
   where organization_id=p_organization_id and project_id=p_project_id and kind=v_kind
   order by revision desc limit 1 for update;
  if v_row.id is null or v_row.status<>'approved' then raise exception 'A technically checked design is required' using errcode='23514';end if;
  update private.site_designs set status='changes_requested',review_note=trim(p_input->>'note'),
    reviewed_by=auth.uid(),reviewed_at=now() where id=v_row.id;
  update private.site_state set approval_evidence='Client change request: '||left(trim(p_input->>'evidence'),2900),
    client_approval_recorded_by=null,client_approval_recorded_at=null,updated_at=now()
    where organization_id=p_organization_id and project_id=p_project_id;
  v_id=v_row.id;
  perform private.site_log(p_organization_id,p_project_id,'client.design_changes_recorded',v_id);
  elsif p_action='client_approve' then
  if v_stage is distinct from 'design' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager approval required' using errcode='42501';end if;
  if p_input-array['evidence']<>'{}'::jsonb then raise exception 'Invalid approval' using errcode='22023';end if;
  v_evidence=trim(coalesce(p_input->>'evidence',''));
  if length(v_evidence) not between 10 and 3000 then raise exception 'Record client approval evidence (minimum ten characters)' using errcode='22023';end if;
  -- Construction and interiors have different mandatory design sets.
  if exists(
    select 1 from unnest(
      case when exists(
        select 1 from public.projects p join public.industries industry on industry.id=p.industry_id
        where p.organization_id=p_organization_id and p.id=p_project_id and industry.key='interior'
      ) then array['interior_layout','3d_design']::text[]
      else array['architectural_plan','3d_design','structural_design']::text[] end
    ) required(kind)
    left join lateral(
      select status from private.site_designs d
      where d.organization_id=p_organization_id and d.project_id=p_project_id
        and d.kind=required.kind order by d.revision desc limit 1
    ) latest on true
    where latest.status is distinct from 'approved'
  ) then raise exception 'Required latest designs must pass technical review before client acceptance' using errcode='23514';end if;
  update private.site_state set stage='client_approved',approval_evidence=v_evidence,client_approval_recorded_by=auth.uid(),client_approval_recorded_at=now(),updated_at=now() where project_id=p_project_id;
  perform private.site_log(p_organization_id,p_project_id,'client.approval_recorded');
 elsif p_action='execution_start' then
  if v_stage is distinct from 'client_approved' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Client approval required before site execution' using errcode='42501';end if;
  update private.site_state set stage='execution',execution_started_at=now(),updated_at=now() where project_id=p_project_id;
  perform private.site_log(p_organization_id,p_project_id,'execution.started');
 elsif p_action='report_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer']) then raise exception 'Site engineer required' using errcode='42501';end if;
  if p_input-array['report_date','completed_work','tomorrow_plan','blockers','checks_done','checks_required','worker_count','tomorrow_workers']<>'{}'::jsonb then raise exception 'Invalid daily report' using errcode='22023';end if;
  if length(trim(coalesce(p_input->>'completed_work',''))) not between 5 and 5000 or length(trim(coalesce(p_input->>'tomorrow_plan',''))) not between 5 and 3000 or length(coalesce(p_input->>'blockers',''))>2000 or length(coalesce(p_input->>'checks_done',''))>3000 or length(coalesce(p_input->>'checks_required',''))>3000 or (p_input->>'worker_count')::integer not between 0 and 10000 or (nullif(p_input->>'tomorrow_workers',''))::integer not between 0 and 10000 then raise exception 'Invalid daily report values' using errcode='22023';end if;
  if (p_input->>'report_date')::date not between current_date-7 and current_date+1 then raise exception 'Report date outside permitted window' using errcode='22023';end if;
  insert into private.site_reports(organization_id,project_id,report_date,completed_work,tomorrow_plan,blockers,checks_done,checks_required,worker_count,tomorrow_workers,created_by)
  values(p_organization_id,p_project_id,(p_input->>'report_date')::date,trim(p_input->>'completed_work'),trim(p_input->>'tomorrow_plan'),coalesce(p_input->>'blockers',''),coalesce(p_input->>'checks_done',''),coalesce(p_input->>'checks_required',''),(p_input->>'worker_count')::integer,nullif(p_input->>'tomorrow_workers','')::integer,auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'daily.reported',v_id);
 elsif p_action='material_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','procurement']) then raise exception 'Material access denied' using errcode='42501';end if;
  if p_input-array['item','quantity','unit','notes']<>'{}'::jsonb then raise exception 'Invalid material request' using errcode='22023';end if;
  if length(trim(coalesce(p_input->>'item',''))) not between 2 and 200 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid material name or notes' using errcode='22023';end if;
  insert into private.site_material_needs(organization_id,project_id,item,quantity,unit,notes,requested_by)
  values(p_organization_id,p_project_id,trim(p_input->>'item'),(p_input->>'quantity')::numeric,p_input->>'unit',coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'material.requested',v_id);
 elsif p_action='material_update' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','procurement']) then raise exception 'Procurement review required' using errcode='42501';end if;
  if p_input-array['id','status','source','vendor_reference']<>'{}'::jsonb then raise exception 'Invalid procurement action' using errcode='22023';end if;
  v_status=p_input->>'status';v_source=p_input->>'source';
  if v_status not in ('approved','ordered','received','rejected') or v_source not in ('undecided','marketplace','outside') or length(coalesce(p_input->>'vendor_reference',''))>500 then raise exception 'Invalid procurement status or source' using errcode='22023';end if;
  if v_status in ('ordered','received') and (v_source='undecided' or length(trim(coalesce(p_input->>'vendor_reference','')))<3) then raise exception 'Real seller, purchase-order or outside supplier reference required' using errcode='23514';end if;
  update private.site_material_needs set status=v_status,source=v_source,vendor_reference=coalesce(p_input->>'vendor_reference',''),reviewed_by=auth.uid(),updated_at=now()
  where organization_id=p_organization_id and project_id=p_project_id and id=(p_input->>'id')::uuid
    and ((status='requested' and v_status in ('approved','rejected'))
      or (status='approved' and v_status='ordered')
      or (status='ordered' and v_status='received'))
  returning id into v_id;
  if v_id is null then raise exception 'Invalid or stale material status transition' using errcode='40001';end if;
  perform private.site_log(p_organization_id,p_project_id,'material.'||v_status,v_id);
 elsif p_action='check_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','quality_inspector']) then raise exception 'Site checking access denied' using errcode='42501';end if;
  if p_input-array['title','due_date','notes']<>'{}'::jsonb or length(trim(coalesce(p_input->>'title',''))) not between 3 and 200 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid site check' using errcode='22023';end if;
  insert into private.site_checks(organization_id,project_id,title,due_date,notes,created_by)
  values(p_organization_id,p_project_id,trim(p_input->>'title'),nullif(p_input->>'due_date','')::date,coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'check.created',v_id);
 elsif p_action='check_update' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','site_engineer','quality_inspector']) then raise exception 'Checking access denied' using errcode='42501';end if;
  if p_input-array['id','status','notes']<>'{}'::jsonb then raise exception 'Invalid check action' using errcode='22023';end if;
  v_status=p_input->>'status';
  if v_status not in ('passed','failed','recheck') or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid check result' using errcode='22023';end if;
  update private.site_checks set status=v_status,notes=coalesce(p_input->>'notes',''),checked_by=auth.uid(),checked_at=now()
  where organization_id=p_organization_id and project_id=p_project_id and id=(p_input->>'id')::uuid
  and status in ('pending','failed','recheck') returning id into v_id;
  if v_id is null then raise exception 'Check already closed or unavailable' using errcode='40001';end if;
  perform private.site_log(p_organization_id,p_project_id,'check.'||v_status,v_id);
 elsif p_action='gate_add' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager','watchman']) then raise exception 'Gate access denied' using errcode='42501';end if;
  if p_input-array['kind','description','notes']<>'{}'::jsonb or p_input->>'kind' not in ('material_delivery','visitor','labour','security_round','curing') or length(trim(coalesce(p_input->>'description',''))) not between 3 and 1500 or length(coalesce(p_input->>'notes',''))>3000 then raise exception 'Invalid gate entry' using errcode='22023';end if;
  insert into private.site_gate(organization_id,project_id,kind,description,notes,created_by)
  values(p_organization_id,p_project_id,p_input->>'kind',trim(p_input->>'description'),coalesce(p_input->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_organization_id,p_project_id,'gate.'||(p_input->>'kind'),v_id);
 elsif p_action='handover' then
  if v_stage is distinct from 'execution' or not private.site_allowed(p_organization_id,p_project_id,array['manager']) then raise exception 'Manager required' using errcode='42501';end if;
  if exists(select 1 from private.site_checks where organization_id=p_organization_id and project_id=p_project_id and status<>'passed') or
     exists(select 1 from private.site_material_needs where organization_id=p_organization_id and project_id=p_project_id and status in ('requested','approved','ordered')) or
     coalesce((private.ops_readiness(p_organization_id,p_project_id)->>'ready')::boolean,false)=false
  then raise exception 'Complete site checks, materials and physical inspections before handover' using errcode='23514';end if;
  update private.site_state set stage='handover',updated_at=now() where project_id=p_project_id;
  perform private.site_log(p_organization_id,p_project_id,'handover.ready');
 else
  raise exception 'Unknown site command' using errcode='22023';
 end if;
 return jsonb_build_object('id',v_id,'action',p_action);
end$function$
;
commit;