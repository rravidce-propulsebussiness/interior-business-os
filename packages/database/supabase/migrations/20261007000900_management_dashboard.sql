begin;
create function public.management_dashboard(p_organization_id uuid,p_filters jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare kind text;report jsonb;reports jsonb='{}';work jsonb='{}';group_name text;begin
 if not private.report_filters(p_filters) then raise exception 'Invalid dashboard period' using errcode='22023';end if;
 foreach kind in array array['crm','sales','billing','receivables','projects','procurement','execution','snags','handover'] loop
 if private.has_permission(p_organization_id,private.report_permission(kind)) then
 report=public.report_read(p_organization_id,kind,p_filters||'{"page":1}');
 reports=reports||jsonb_build_object(kind,jsonb_build_object('total',report->'total','summary',report->'summary','aging',report->'aging','basis',report->'basis'));
 end if;end loop;
 if private.has_permission(p_organization_id,'notification.view') then
 foreach group_name in array array['assigned','today','overdue','approvals'] loop
 work=work||jsonb_build_object(group_name,public.work_queue(p_organization_id,group_name,1)->'total');
 end loop;end if;
 return jsonb_build_object('reports',reports,'work',work,'filters',p_filters,'generated_at',now());
end$$;
revoke all on function public.management_dashboard(uuid,jsonb) from public,anon,authenticated,business_os_worker;
grant execute on function public.management_dashboard(uuid,jsonb) to authenticated;
commit;
