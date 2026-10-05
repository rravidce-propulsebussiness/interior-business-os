begin;
alter table public.estimation_recipe_items add column version integer not null default 1 check(version>0);
alter table public.estimation_recipe_item_costs add column version integer not null default 1 check(version>0);
create function private.execution_scope_snapshot(snap jsonb,description text,area text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version',1,'name',coalesce(snap->>'name',description),'description',description,'area',coalesce(area,''),'item_key',coalesce(snap->>'code',''),'quantity',snap->>'quantity','unit',snap->'unit',
 'specifications',coalesce(snap->'customer_specifications','[]'),'answers',coalesce(nullif(snap#>'{pricing_input,answers}','null'),'{}'),
 'measurements',coalesce(nullif(snap#>'{pricing_input,measurements}','null'),'{}')||jsonb_build_object('quantity',snap->>'quantity')||case when (select dimension from public.units where key=snap#>>'{unit,key}')='area' then jsonb_build_object('finished_area',snap->>'quantity') else '{}'::jsonb end);
$$;
create function private.execution_scope(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x.source_type,x.source_id),'[]') from (
 select 'quotation' source_type,i.id source_id,i.project_area_id area_id,coalesce(i.area_snapshot->>'name','') area_name,private.execution_scope_snapshot(i.snapshot,i.description,i.area_snapshot->>'name') snapshot
 from public.contracts c join public.quotation_items i on i.revision_id=c.revision_id where c.id=target and not i.optional and not exists(select 1 from public.change_order_items ci join public.change_orders co on co.id=ci.change_order_id where co.contract_id=c.id and co.status='approved' and ci.original_item_id=i.id and ci.change_type in ('deletion','modification'))
 union all
 select 'change_order',ci.id,original.project_area_id,coalesce(nullif(ci.area,''),original.area_snapshot->>'name',''),private.execution_scope_snapshot(ci.new_snapshot,ci.description,coalesce(nullif(ci.area,''),original.area_snapshot->>'name',''))
 from public.change_orders co join public.change_order_items ci on ci.change_order_id=co.id left join public.quotation_items original on original.id=ci.original_item_id where co.contract_id=target and co.status='approved' and ci.change_type in ('addition','modification')
 )x;
$$;
create function private.execution_suggestions(org uuid,snapshot jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version) order by name,id),'[]') from (select r.id,r.name,r.version from public.estimation_recipes r where r.organization_id=org and r.status='active' and r.matching<>'{}'::jsonb and (not(r.matching ? 'item_key') or r.matching->>'item_key'=snapshot->>'item_key') and (not(r.matching ? 'answers') or (snapshot->'answers') @> (r.matching->'answers')) order by r.name,r.id limit 25)r;
$$;
create function public.execution_scope(p_organization_id uuid,p_contract_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare scope jsonb;result jsonb;begin
 if not private.execution_access(p_organization_id,'estimate.view') or not exists(select 1 from public.contracts where organization_id=p_organization_id and id=p_contract_id) then raise exception 'Unavailable execution scope' using errcode='42501';end if;
 scope=private.execution_scope(p_contract_id);
 select coalesce(jsonb_agg(x||jsonb_build_object('suggested_recipes',private.execution_suggestions(p_organization_id,x->'snapshot'),'covered',exists(select 1 from public.execution_estimates e join public.execution_estimate_scope_items s on s.revision_id=e.current_approved_revision_id where e.contract_id=p_contract_id and s.source_type=x->>'source_type' and s.source_id=(x->>'source_id')::uuid and s.coverage in ('estimated','excluded')))),'[]') into result from jsonb_array_elements(scope)x;
 return jsonb_build_object('scope',result,'fingerprint',md5(scope::text),'total',jsonb_array_length(scope),'covered',(select count(*) from jsonb_array_elements(result)x where (x->>'covered')::boolean),'unestimated',(select count(*) from jsonb_array_elements(result)x where not(x->>'covered')::boolean));
end$$;
create function private.execution_sync_scope(org uuid,revision uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.execution_estimate_revisions;scope jsonb;x jsonb;suggested jsonb;ordinal integer=0;begin
 select * into r from public.execution_estimate_revisions where organization_id=org and id=revision for update;
 if r.id is null or r.status<>'draft' then raise exception 'Draft estimate required' using errcode='22023';end if;
 scope=private.execution_scope(r.contract_id);
 if jsonb_array_length(scope)>500 then raise exception 'Commercial scope exceeds supported revision limit' using errcode='22023';end if;
 update public.execution_estimate_scope_items s set coverage='removed' where s.revision_id=r.id and not exists(select 1 from jsonb_array_elements(scope) as current_scope(value) where current_scope.value->>'source_type'=s.source_type and (current_scope.value->>'source_id')::uuid=s.source_id);
 for x in select jsonb_array_elements(scope) loop
 suggested=private.execution_suggestions(org,x->'snapshot');
 insert into public.execution_estimate_scope_items(organization_id,revision_id,contract_id,source_type,source_id,area_id,area_name,snapshot,suggested_recipe_id,sort_order)
 values(org,r.id,r.contract_id,x->>'source_type',(x->>'source_id')::uuid,(x->>'area_id')::uuid,x->>'area_name',x->'snapshot',case when jsonb_array_length(suggested)=1 then (suggested->0->>'id')::uuid end,ordinal)
 on conflict(revision_id,source_type,source_id) do nothing;ordinal=ordinal+1;
 end loop;
 update public.execution_estimate_revisions set scope_fingerprint=md5(scope::text) where id=r.id;
end$$;
create function public.execution_estimate_command(p_organization_id uuid,p_action text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 if p_action='approve' and r.status='approved' or p_action='submit' and r.status='under_review' or p_action='cancel' and r.status='cancelled' then return r.id;end if;
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
revoke all on function private.execution_scope_snapshot(jsonb,text,text),private.execution_scope(uuid),private.execution_suggestions(uuid,jsonb),private.execution_sync_scope(uuid,uuid) from public,anon,authenticated;
revoke all on function public.execution_scope(uuid,uuid),public.execution_estimate_command(uuid,text,jsonb) from public,anon;
grant execute on function public.execution_scope(uuid,uuid),public.execution_estimate_command(uuid,text,jsonb) to authenticated;
commit;



