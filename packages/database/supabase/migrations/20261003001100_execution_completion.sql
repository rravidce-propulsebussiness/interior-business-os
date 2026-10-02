begin;
-- Stale approval/issue attempts conflict; creation and receipts retain payload-bound retries.
create or replace function public.execution_estimate_command(p_organization_id uuid,p_action text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.execution_estimates;r public.execution_estimate_revisions;c public.contracts;old_scope public.execution_estimate_scope_items;old_line public.execution_estimate_lines;new_scope uuid;new_line uuid;target uuid;permission text;begin
 permission=case p_action when 'create' then 'estimate.create' when 'revise' then 'estimate.create' when 'approve' then 'estimate.approve' when 'return' then 'estimate.review' else 'estimate.edit' end;
 perform private.execution_require(p_organization_id,permission);
 if p_action is null or p_action not in ('create','revise','sync','submit','approve','return','cancel','exclude_scope') or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>10000 then raise exception 'Invalid estimate command' using errcode='22023';end if;
 if p_action='create' then
 select * into c from public.contracts where organization_id=p_organization_id and id=(p_input->>'contract_id')::uuid and status not in ('closed','cancelled') for update;
 if c.id is null then raise exception 'Unavailable contract' using errcode='42501';end if;
 select * into e from public.execution_estimates where organization_id=p_organization_id and contract_id=c.id for update;
 if e.id is not null then select id into target from public.execution_estimate_revisions where estimate_id=e.id and status in ('draft','under_review');if target is not null then return target;end if;raise exception 'Use a new estimate revision' using errcode='22023';end if;
 insert into public.execution_estimates(organization_id,contract_id,project_id,estimate_number) values(p_organization_id,c.id,c.project_id,private.finance_number(p_organization_id,'execution_estimate','EST')) returning * into e;
 insert into public.execution_estimate_revisions(organization_id,estimate_id,contract_id,project_id,revision_number,scope_fingerprint,notes) values(p_organization_id,e.id,c.id,c.project_id,1,'',coalesce(p_input->>'notes','')) returning id into target;
 perform private.execution_sync_scope(p_organization_id,target);perform private.crm_audit(p_organization_id,'estimate.created','execution_estimate_revisions',target);return target;
 end if;
 select * into r from public.execution_estimate_revisions where organization_id=p_organization_id and id=(p_input->>'id')::uuid for update;
 if r.id is null then raise exception 'Unavailable estimate revision' using errcode='42501';end if;
 select * into e from public.execution_estimates where id=r.estimate_id for update;
 select * into c from public.contracts where id=r.contract_id for update;
 if c.status in ('closed','cancelled') then raise exception 'Contract is not open for execution changes' using errcode='22023';end if;
 if p_action='submit' and r.status='under_review' or p_action='cancel' and r.status='cancelled' then return r.id;end if;
 if r.version is distinct from (p_input->>'version')::integer then raise exception 'Stale estimate revision' using errcode='40001';end if;
 if p_action='revise' then
 if r.status not in ('approved','superseded') then raise exception 'Approved revision required' using errcode='22023';end if;
 select id into target from public.execution_estimate_revisions where estimate_id=e.id and status in ('draft','under_review');if target is not null then return target;end if;
 insert into public.execution_estimate_revisions(organization_id,estimate_id,contract_id,project_id,revision_number,scope_fingerprint,notes) values(p_organization_id,e.id,c.id,c.project_id,e.next_revision,r.scope_fingerprint,coalesce(p_input->>'notes',r.notes)) returning id into target;
 update public.execution_estimates set next_revision=next_revision+1,version=version+1 where id=e.id;
 for old_scope in select * from public.execution_estimate_scope_items where revision_id=r.id order by sort_order,id loop
 insert into public.execution_estimate_scope_items(organization_id,revision_id,contract_id,source_type,source_id,area_id,area_name,snapshot,coverage,exclusion_reason,suggested_recipe_id,selected_recipe_id,recipe_reason,sort_order)
 values(p_organization_id,target,c.id,old_scope.source_type,old_scope.source_id,old_scope.area_id,old_scope.area_name,old_scope.snapshot,old_scope.coverage,old_scope.exclusion_reason,old_scope.suggested_recipe_id,old_scope.selected_recipe_id,old_scope.recipe_reason,old_scope.sort_order) returning id into new_scope;
 for old_line in select * from public.execution_estimate_lines where scope_id=old_scope.id order by sort_order,id loop
 new_line=gen_random_uuid();
 insert into public.execution_estimate_lines select (jsonb_populate_record(null::public.execution_estimate_lines,to_jsonb(old_line)||jsonb_build_object('id',new_line,'revision_id',target,'scope_id',new_scope,'created_by',auth.uid(),'created_at',now(),'updated_at',now()))).*;
 insert into public.execution_estimate_line_costs select (jsonb_populate_record(null::public.execution_estimate_line_costs,to_jsonb(cost)||jsonb_build_object('id',gen_random_uuid(),'line_id',new_line,'revision_id',target,'created_by',auth.uid(),'created_at',now(),'updated_at',now()))).* from public.execution_estimate_line_costs cost where line_id=old_line.id;
 end loop;end loop;
 perform private.execution_sync_scope(p_organization_id,target);perform private.crm_audit(p_organization_id,'estimate.revised','execution_estimate_revisions',target);return target;
 elsif p_action='sync' then perform private.execution_sync_scope(p_organization_id,r.id);
 elsif p_action='exclude_scope' then
 if r.status<>'draft' or length(trim(coalesce(p_input->>'reason','')))<3 or exists(select 1 from public.execution_estimate_lines where scope_id=(p_input->>'scope_id')::uuid) then raise exception 'Empty draft scope and exclusion reason required' using errcode='22023';end if;
 update public.execution_estimate_scope_items set coverage='excluded',exclusion_reason=p_input->>'reason' where organization_id=p_organization_id and revision_id=r.id and id=(p_input->>'scope_id')::uuid and coverage<>'removed';if not found then raise exception 'Unavailable scope' using errcode='42501';end if;
 elsif p_action='submit' then
 if r.status<>'draft' or r.scope_fingerprint<>md5(private.execution_scope(c.id)::text) then raise exception 'Synchronize current approved scope before submission' using errcode='40001';end if;
 if exists(select 1 from public.execution_estimate_scope_items where revision_id=r.id and coverage='unestimated') then raise exception 'Estimate or explicitly exclude every active scope item' using errcode='22023';end if;
 update public.execution_estimate_revisions set status='under_review',version=version+1,submitted_at=now() where id=r.id;
 elsif p_action='approve' then
 perform private.execution_require(p_organization_id,'estimate.view_cost');
 if r.status<>'under_review' or r.scope_fingerprint<>md5(private.execution_scope(c.id)::text) then raise exception 'Current reviewed estimate required' using errcode='40001';end if;
 if exists(select 1 from public.execution_estimate_lines l join public.execution_estimate_scope_items s on s.id=l.scope_id left join public.execution_estimate_line_costs lc on lc.line_id=l.id where l.revision_id=r.id and s.coverage<>'removed' and lc.id is null) then raise exception 'Missing cost basis must be resolved before approval' using errcode='22023';end if;
 update public.execution_estimate_revisions set status='superseded',version=version+1 where id=e.current_approved_revision_id;
 update public.execution_estimate_revisions set status='approved',version=version+1,approved_at=now(),approved_by=auth.uid(),reviewed_by=coalesce(reviewed_by,auth.uid()) where id=r.id;
 update public.execution_estimates set current_approved_revision_id=r.id,version=version+1 where id=e.id;
 elsif p_action='return' then
 if r.status<>'under_review' or length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Reviewed estimate and reason required' using errcode='22023';end if;
 update public.execution_estimate_revisions set status='draft',version=version+1,decision_reason=p_input->>'reason',reviewed_by=auth.uid() where id=r.id;
 elsif p_action='cancel' then
 if r.status not in ('draft','under_review') or length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Open revision and reason required' using errcode='22023';end if;
 update public.execution_estimate_revisions set status='cancelled',version=version+1,decision_reason=p_input->>'reason' where id=r.id;
 end if;
 if p_action in ('sync','exclude_scope') then update public.execution_estimate_revisions set version=version+1 where id=r.id;end if;
 perform private.crm_audit(p_organization_id,'estimate.'||case p_action when 'submit' then 'submitted' when 'approve' then 'approved' when 'return' then 'returned' when 'cancel' then 'cancelled' else 'scope_updated' end,'execution_estimate_revisions',r.id);return r.id;
end$$;
create or replace function public.execution_po_transition(p_organization_id uuid,p_id uuid,p_version integer,p_action text,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare po public.purchase_orders;begin
 if p_action is null or p_action not in ('issue','cancel','close') then raise exception 'Invalid purchase order transition' using errcode='22023';end if;
 perform private.execution_require(p_organization_id,case when p_action='issue' then 'purchase_order.issue' else 'purchase_order.manage' end);
 select * into po from public.purchase_orders where organization_id=p_organization_id and id=p_id for update;
 if po.id is null then raise exception 'Unavailable purchase order' using errcode='42501';end if;
 if p_action='cancel' and po.status='cancelled' or p_action='close' and po.status='closed' then return po.id;end if;
 if po.version is distinct from p_version then raise exception 'Stale purchase order' using errcode='40001';end if;
 if p_action='issue' then
 perform private.execution_require(p_organization_id,'purchase_order.view_cost');
 perform private.execution_po_price(po.id);
 update public.purchase_orders set status='issued',version=version+1,issued_at=now(),issued_by=auth.uid() where id=po.id;
 else
 if length(trim(coalesce(p_reason,''))) not between 3 and 3000 then raise exception 'Purchase order decision reason required' using errcode='22023';end if;
 if p_action='cancel' then
 if po.status not in ('draft','issued') or exists(select 1 from public.goods_receipts where po_id=po.id) then raise exception 'Received purchase order cannot be cancelled' using errcode='22023';end if;
 update public.purchase_orders set status='cancelled',version=version+1,decision_reason=p_reason where id=po.id;
 else
 if po.status<>'received' then raise exception 'Fully received purchase order required for closure' using errcode='22023';end if;
 update public.purchase_orders set status='closed',version=version+1,closed_at=now(),decision_reason=p_reason where id=po.id;end if;end if;
 perform private.crm_audit(p_organization_id,'purchase_order.'||p_action,'purchase_orders',po.id);return po.id;
end$$;
commit;
