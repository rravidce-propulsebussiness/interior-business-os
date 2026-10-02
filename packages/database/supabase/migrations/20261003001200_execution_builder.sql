begin;
create function public.execution_line_remove(p_organization_id uuid,p_revision_id uuid,p_line_id uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.execution_estimate_revisions;scope uuid;begin
 perform private.execution_require(p_organization_id,'estimate.edit');
 select * into r from public.execution_estimate_revisions where organization_id=p_organization_id and id=p_revision_id for update;
 if r.id is null then raise exception 'Unavailable estimate' using errcode='42501';end if;
 if r.status<>'draft' or r.version is distinct from p_version then raise exception 'Current draft estimate required' using errcode='40001';end if;
 if exists(select 1 from public.contracts where id=r.contract_id and status in ('closed','cancelled')) then raise exception 'Contract is closed' using errcode='22023';end if;
 select scope_id into scope from public.execution_estimate_lines where organization_id=p_organization_id and revision_id=r.id and id=p_line_id;
 if scope is null then raise exception 'Unavailable estimate line' using errcode='42501';end if;
 delete from public.execution_estimate_line_costs where line_id=p_line_id;
 delete from public.execution_estimate_lines where id=p_line_id;
 update public.execution_estimate_scope_items s set coverage='unestimated',selected_recipe_id=null,recipe_reason='' where s.id=scope and s.coverage<>'removed' and not exists(select 1 from public.execution_estimate_lines where scope_id=s.id);
 update public.execution_estimate_revisions set version=version+1 where id=r.id;
 perform private.crm_audit(p_organization_id,'estimate.line_removed','execution_estimate_revisions',r.id);return r.id;
end$$;
create function public.execution_recipe_apply(p_organization_id uuid,p_revision_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.execution_estimate_revisions;item public.estimation_recipe_items;body jsonb;v integer;begin
 perform private.execution_require(p_organization_id,'estimate.edit');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>10000 or p_input-array['version','scope_id','recipe_id','recipe_reason','measurements','measurement_note','drawing_reference','site_measurement_version','accuracy','cost_date']<>'{}'::jsonb then raise exception 'Invalid recipe application' using errcode='22023';end if;
 select * into r from public.execution_estimate_revisions where organization_id=p_organization_id and id=p_revision_id for update;
 if r.id is null then raise exception 'Unavailable estimate' using errcode='42501';end if;
 if r.status<>'draft' or r.version is distinct from (p_input->>'version')::integer then raise exception 'Current draft estimate required' using errcode='40001';end if;
 if not exists(select 1 from public.estimation_recipe_items where organization_id=p_organization_id and recipe_id=(p_input->>'recipe_id')::uuid and active) then raise exception 'Recipe requires active components' using errcode='22023';end if;
 if exists(select 1 from public.execution_estimate_lines l join public.estimation_recipe_items ri on ri.id=l.recipe_item_id where l.scope_id=(p_input->>'scope_id')::uuid and ri.recipe_id=(p_input->>'recipe_id')::uuid) then raise exception 'Recipe is already applied; edit or remove its lines first' using errcode='40001';end if;
 v=r.version;
 for item in select * from public.estimation_recipe_items where organization_id=p_organization_id and recipe_id=(p_input->>'recipe_id')::uuid and active order by sort_order,id loop
 body=(p_input-'recipe_id')||jsonb_build_object('version',v,'method','recipe','recipe_item_id',item.id,'sort_order',item.sort_order);
 perform public.execution_line_save(p_organization_id,r.id,body);v=v+1;end loop;
 perform private.crm_audit(p_organization_id,'estimate.recipe_applied','execution_estimate_revisions',r.id);return r.id;
end$$;
revoke all on function public.execution_line_remove(uuid,uuid,uuid,integer),public.execution_recipe_apply(uuid,uuid,jsonb) from public,anon;
grant execute on function public.execution_line_remove(uuid,uuid,uuid,integer),public.execution_recipe_apply(uuid,uuid,jsonb) to authenticated;
commit;
