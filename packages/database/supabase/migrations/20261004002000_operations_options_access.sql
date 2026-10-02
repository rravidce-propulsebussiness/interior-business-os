begin;
create or replace function public.operations_options(p_organization_id uuid,p_kind text,p_project_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb;table_name text;scope_filter text='true';begin
 if p_page is null or p_page not between 1 and 10000 or length(p_query)>100 then raise exception 'Invalid choices query' using errcode='22023';end if;
 if not private.ops_access(p_organization_id,'execution.view') or p_project_id is not null and not private.ops_project(p_organization_id,p_project_id) then raise exception 'Unavailable choices' using errcode='42501';end if;
 if p_kind='members' then
 select coalesce(jsonb_agg(x),'[]') into rows from(select m.user_id id,coalesce(nullif(p.full_name,''),'Organization member') label from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id and m.status='active' and p.status='active' and position(lower(p_query) in lower(p.full_name))>0 order by p.full_name,m.user_id limit 25 offset (p_page-1)*25)x;
 else
 if p_kind not in ('projects','project_areas','contracts','execution_plans','work_packages','project_milestones','project_tasks','inventory_locations','inventory_lots','material_issue_request_items','inventory_transactions','vendors','material_variants','goods_receipt_items','execution_estimate_scope_items','execution_estimate_lines','inspection_templates','project_inspections','handover_templates') then raise exception 'Unknown reference choices' using errcode='22023';end if;
 table_name=p_kind;
 if p_kind='projects' then scope_filter='private.ops_project(t.organization_id,t.id)';
 elsif p_kind in ('project_areas','contracts','execution_plans','work_packages','project_milestones','project_tasks','material_issue_request_items','inventory_transactions','project_inspections') then scope_filter='($2 is null or t.project_id=$2)';
 elsif p_kind='inventory_locations' then scope_filter='($2 is null or t.site_project_id is null or t.site_project_id=$2)';end if;
 execute format('select coalesce(jsonb_agg(x),''[]'') from(select t.id,coalesce(nullif(concat_ws('' · '',to_jsonb(t)->>''name'',to_jsonb(t)->>''title'',to_jsonb(t)->>''label'',to_jsonb(t)->>''description'',to_jsonb(t)->>''plan_number'',to_jsonb(t)->>''contract_number'',to_jsonb(t)->>''number'',to_jsonb(t)->>''unit''),''''),''Record ''||left(t.id::text,8)) label from public.%I t where t.organization_id=$1 and %s and position(lower($3) in lower(to_jsonb(t)::text))>0 order by t.created_at desc,t.id limit 25 offset $4)x',table_name,scope_filter) into rows using p_organization_id,p_project_id,p_query,(p_page-1)*25;
 end if;return jsonb_build_object('rows',rows,'page',p_page,'has_more',jsonb_array_length(rows)=25);
end$$;
revoke all on function public.operations_options(uuid,text,uuid,text,integer) from public,anon;
grant execute on function public.operations_options(uuid,text,uuid,text,integer) to authenticated;
commit;
