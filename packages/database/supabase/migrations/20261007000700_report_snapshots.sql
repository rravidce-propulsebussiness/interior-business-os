begin;
create function private.report_snapshot_access(org uuid,target uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare snapshot public.report_snapshots;row jsonb;source private.report_sources;project uuid;allowed boolean;begin
 select * into snapshot from public.report_snapshots where organization_id=org and id=target;
 if snapshot.id is null or not private.has_permission(org,'report.export') or not private.has_permission(org,private.report_permission(snapshot.kind)) then return false;end if;
 if snapshot.kind='inventory' then return private.ops_access(org,'inventory.view',(snapshot.filters->>'projectId')::uuid) and private.ops_access(org,'execution.view',(snapshot.filters->>'projectId')::uuid);end if;
 if snapshot.kind='cost' then return private.ops_access(org,'cost.execution.view',(snapshot.filters->>'projectId')::uuid) and private.execution_access(org,'cost_report.view') and private.execution_access(org,'estimate.view_cost') and private.execution_access(org,'purchase_order.view_cost') and private.finance_access(org,'contract.view');end if;
 for row in select value from jsonb_array_elements(snapshot.data->'rows') loop
 select * into source from private.report_sources where report=snapshot.kind and kind=row->>'kind';
 if source.kind is null then return false;end if;
 allowed=case source.family when 'crm' then private.crm_access(org,source.permission) when 'finance' then private.finance_access(org,source.permission) when 'execution' then private.execution_access(org,source.permission) when 'operations' then private.ops_access(org,source.permission,(row->>'project_id')::uuid) else private.commercial_access(org,source.permission,source.module_key) end;
 if not coalesce(allowed,false) then return false;end if;
 if source.kind in('po','vendor_quote') and row->>'value' is not null and not private.execution_access(org,'cost_report.view') then return false;end if;
 if source.kind='po' and row->>'value' is not null and not private.execution_access(org,'purchase_order.view_cost') then return false;end if;
 -- Do not trust the old snapshot's project assignment for current source access.
 if source.family='operations' then execute format('select project_id from public.%I where organization_id=$1 and id=$2',source.table_name) into project using org,(row->>'id')::uuid;
 if project is null or not private.ops_access(org,source.permission,project) then return false;end if;end if;
 end loop;return true;
end$$;
create function public.report_snapshot_create(p_organization_id uuid,p_kind text,p_filters jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare report jsonb;batch jsonb;rows jsonb;page integer=1;id uuid;begin
 perform private.automation_require(p_organization_id,'report.export');
 report=public.report_read(p_organization_id,p_kind,p_filters||'{"page":1}');
 if (report->>'total')::integer>5000 then raise exception 'Narrow report filters to at most 5000 rows before exporting' using errcode='22023';end if;
 rows=report->'rows';
 while page*25<(report->>'total')::integer loop
 page=page+1;batch=public.report_read(p_organization_id,p_kind,p_filters||jsonb_build_object('page',page));rows=rows||batch->'rows';
 end loop;
 report=jsonb_set(report,'{rows}',rows)||jsonb_build_object('page',1,'page_size',jsonb_array_length(rows),'organization_name',(select o.name from public.organizations o where o.id=p_organization_id),'generated_by',auth.uid(),'renderer_version',1);
 insert into public.report_snapshots(organization_id,kind,filters,data,created_by) values(p_organization_id,p_kind,p_filters-'page',report,auth.uid()) returning report_snapshots.id into id;
 perform private.automation_audit(p_organization_id,'report.snapshot.created','report_snapshots',id);return id;
end$$;
create function public.report_snapshot_read(p_organization_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.report_snapshot_access(p_organization_id,p_id) then raise exception 'Unavailable report snapshot' using errcode='42501';end if;
 return (select jsonb_build_object('id',id,'kind',kind,'filters',filters,'data',data,'renderer_version',renderer_version,'created_by',created_by,'created_at',created_at) from public.report_snapshots where organization_id=p_organization_id and id=p_id);
end$$;
create function public.report_snapshot_history(p_organization_id uuid,p_kind text,p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$declare rows jsonb;begin
 if p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') into rows from(select id,kind,filters,renderer_version,created_at,created_by from public.report_snapshots where organization_id=p_organization_id and kind=p_kind order by created_at desc,id limit 25 offset(p_page-1)*25)s;
 return jsonb_build_object('rows',rows,'page',p_page);
end$$;
grant select on public.report_snapshots to authenticated;
create policy report_snapshot_read on public.report_snapshots for select to authenticated using(private.report_snapshot_access(organization_id,id));
revoke all on function private.report_snapshot_access(uuid,uuid),public.report_snapshot_create(uuid,text,jsonb),public.report_snapshot_read(uuid,uuid),public.report_snapshot_history(uuid,text,integer) from public,anon,authenticated,business_os_worker;
grant execute on function private.report_snapshot_access(uuid,uuid),public.report_snapshot_create(uuid,text,jsonb),public.report_snapshot_read(uuid,uuid),public.report_snapshot_history(uuid,text,integer) to authenticated;
commit;
