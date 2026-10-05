begin;
-- A fixed registry describes existing canonical sources, never browser SQL.
create table private.report_sources(report text not null,kind text not null,table_name text not null,permission text not null,family text not null,module_key text not null,primary key(report,kind));
insert into private.report_sources values
 ('crm','lead','leads','lead.view','crm','crm'),('crm','followup','lead_followups','lead.view','crm','crm'),('crm','activity','lead_activities','lead.view','crm','crm'),
 ('sales','quotation','quotation_revisions','quotation.view','commercial','quotation'),
 ('billing','invoice','invoices','invoice.view','finance','billing'),('billing','payment','payments','payment.view','finance','billing'),('billing','contract','contracts','contract.view','finance','billing'),
 ('receivables','invoice','invoices','invoice.view','finance','billing'),
 ('projects','project','projects','project.view','commercial','projects'),('projects','plan','execution_plans','execution.view','operations','projects'),
 ('procurement','requisition','purchase_requisitions','purchase_requisition.view','execution','purchasing'),('procurement','rfq','rfqs','rfq.view','execution','purchasing'),('procurement','vendor_quote','vendor_quotes','vendor_quote.view','execution','vendors'),('procurement','po','purchase_orders','purchase_order.view','execution','purchasing'),('procurement','receipt','goods_receipts','goods_receipt.view','execution','purchasing'),
 ('execution','task','project_tasks','task.view','operations','projects'),('execution','milestone','project_milestones','milestone.view','operations','projects'),('execution','inspection','project_inspections','inspection.view','operations','projects'),('execution','snag','project_snags','snag.view','operations','projects'),('execution','handover','handover_records','handover.view','operations','projects'),
 ('snags','snag','project_snags','snag.view','operations','projects'),('handover','handover','handover_records','handover.view','operations','projects'),('handover','plan','execution_plans','execution.view','operations','projects'),
 ('subcontractors','work_order','subcontractor_work_orders','subcontractor.view','operations','projects'),('subcontractors','measurement','work_measurements','subcontractor.view','operations','projects');
revoke all on private.report_sources from public,anon,authenticated,business_os_worker;
create function private.report_permission(kind text) returns text language sql immutable set search_path='' as $$
 select case kind when 'crm' then 'report.crm.view' when 'sales' then 'report.sales.view' when 'billing' then 'report.billing.view' when 'receivables' then 'report.billing.view' when 'projects' then 'report.project.view' when 'procurement' then 'report.procurement.view' when 'inventory' then 'report.inventory.view' when 'execution' then 'report.execution.view' when 'snags' then 'report.execution.view' when 'handover' then 'report.execution.view' when 'subcontractors' then 'report.execution.view' when 'cost' then 'report.cost.view' end;
$$;
create function private.report_filters(filters jsonb) returns boolean language plpgsql stable set search_path='' as $$declare k text;previous integer=0;bucket jsonb;begin
 if jsonb_typeof(filters) is distinct from 'object' or filters-array['from','to','projectId','customerId','assigneeId','industryId','location','status','page','agingBuckets']<>'{}'::jsonb or not filters ?& array['from','to'] then return false;end if;
 if jsonb_typeof(filters->'from') is distinct from 'string' or jsonb_typeof(filters->'to') is distinct from 'string' or filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$' or filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$' then return false;end if;
 foreach k in array array['projectId','customerId','assigneeId','industryId','location','status'] loop if filters ? k and jsonb_typeof(filters->k) is distinct from 'string' then return false;end if;end loop;
 if filters ? 'page' and (jsonb_typeof(filters->'page') is distinct from 'number' or filters->>'page' !~ '^[0-9]+$') then return false;end if;
 if (filters->>'from')::date>(filters->>'to')::date or (filters->>'to')::date-(filters->>'from')::date>3660 or coalesce((filters->>'page')::integer,1) not between 1 and 10000 or length(coalesce(filters->>'location',''))>200 or length(coalesce(filters->>'status',''))>60 then return false;end if;
 foreach k in array array['projectId','customerId','assigneeId','industryId'] loop if filters ? k then perform (filters->>k)::uuid;end if;end loop;
 if filters ? 'agingBuckets' then
 if jsonb_typeof(filters->'agingBuckets') is distinct from 'array' or jsonb_array_length(filters->'agingBuckets') not between 1 and 6 then return false;end if;
 for bucket in select value from jsonb_array_elements(filters->'agingBuckets') loop if jsonb_typeof(bucket) is distinct from 'number' or bucket::text !~ '^[0-9]+$' or bucket::text::integer<=previous or bucket::text::integer>3650 then return false;end if;previous=bucket::text::integer;end loop;
 end if;return true;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then return false;end$$;
create function private.report_rows(org uuid,report_kind text,filters jsonb) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare source private.report_sources;allowed boolean;zone text;query text;begin
 if private.report_permission(report_kind) is null or not private.has_permission(org,private.report_permission(report_kind)) then raise exception 'Unavailable report' using errcode='42501';end if;
 if not private.report_filters(filters) then raise exception 'Invalid report filters' using errcode='22023';end if;
 select default_timezone into zone from public.organizations where id=org;
 for source in select * from private.report_sources where report=report_kind order by kind loop
 allowed=case source.family when 'crm' then private.crm_access(org,source.permission) when 'finance' then private.finance_access(org,source.permission) when 'execution' then private.execution_access(org,source.permission) when 'operations' then private.has_permission(org,source.permission) and private.entitled(org,'projects') else private.commercial_access(org,source.permission,source.module_key) end;
 if not coalesce(allowed,false) then continue;end if;
 -- IDs, tenant predicate and date bounds are applied before source projection.
 query=format($query$
 with raw as materialized (
 select t.id,to_jsonb(t) d from public.%I t where t.organization_id=$1
 and ($2='receivables' or t.created_at>=($3::date::timestamp at time zone $5))
 and t.created_at<(($4::date+1)::timestamp at time zone $5)
 ), contextual as (
 select raw.id,d,p.id project_id,p.name project_name,coalesce((d->>'customer_id')::uuid,(d->>'converted_customer_id')::uuid,p.customer_id,l.converted_customer_id) customer_id,
 coalesce((d->>'assigned_to')::uuid,(d->>'assigned_user_id')::uuid,(d->>'manager_id')::uuid,(d->>'inspector_id')::uuid,p.assigned_user_id) assignee_id,
 coalesce((d->>'industry_id')::uuid,p.industry_id) industry_id,coalesce(d->>'location',d#>>'{site_address,city}',p.site_address->>'city','') location
 from raw left join public.leads l on l.organization_id=$1 and l.id=(d->>'lead_id')::uuid left join public.projects p on p.organization_id=$1 and p.id=case when $6='project' then raw.id else coalesce((d->>'project_id')::uuid,(d->>'converted_project_id')::uuid,l.converted_project_id) end
 ), filtered as materialized (
 select * from contextual c where ($7 is null or c.project_id=$7) and ($8 is null or c.customer_id=$8) and ($9 is null or c.assignee_id=$9)
 and ($10 is null or c.industry_id=$10) and ($11 is null or c.location ilike '%%'||$11||'%%') and ($12 is null or coalesce(d->>'status',d->>'lifecycle','recorded')=$12)
 and ($13<>'operations' or private.ops_access($1,$14,c.project_id))
 ), projected as (
 select jsonb_build_object('id',f.id,'kind',$6,'number',coalesce(d->>'lead_number',d->>'invoice_number',d->>'payment_number',d->>'contract_number',d->>'po_number',d->>'receipt_number',d->>'requisition_number',d->>'rfq_number',d->>'number',d->>'plan_number',q.quotation_number,''),
 'title',coalesce(d->>'title',d->>'name',d->>'activity_type',f.project_name,$6),'status',coalesce(d->>'status',d->>'lifecycle','recorded'),'priority',d->>'priority',
 'project_id',f.project_id,'project_name',f.project_name,'customer_id',f.customer_id,'assignee_id',f.assignee_id,'industry_id',f.industry_id,'location',f.location,
 'created_at',d->>'created_at','due_date',coalesce(d->>'due_date',d->>'planned_end',d->>'delivery_date',d->>'required_date',d->>'valid_until',((d->>'due_at')::timestamptz at time zone $5)::date::text),
 'planned_start',d->>'planned_start','actual_start',d->>'actual_start','completion',coalesce(d->>'completion_percentage',d->>'completed_percentage'),
 'lead_source',d->>'source_id','lead_stage',d->>'stage_id','handover_date',d->>'handover_date','warranty_end',d->>'warranty_end','quantity',d->>'quantity','unit',d->>'unit',
 'currency',d->>'currency','value',case $6 when 'invoice' then case when d->>'status'='issued' then d->>'total' end when 'payment' then case when d->>'status'='confirmed' then d->>'amount' end when 'contract' then private.contract_value(f.id)::text when 'quotation' then d#>>'{totals,final_amount}' when 'vendor_quote' then case when private.execution_access($1,'cost_report.view') then d->>'total' end when 'po' then case when private.execution_access($1,'cost_report.view') and private.execution_access($1,'purchase_order.view_cost') and d->>'status' in('issued','partially_received','received','closed') then (select total from public.purchase_order_costs where organization_id=$1 and po_id=f.id) end end,
 'paid',case when $6='invoice' and d->>'status'='issued' then private.invoice_paid(f.id)::text end,
 'outstanding',case when $6='invoice' and d->>'status'='issued' then greatest(0,(d->>'total')::numeric-private.invoice_paid(f.id))::text end,
 'customer_response',case when $6='quotation' then (select action from public.quotation_customer_responses where organization_id=$1 and revision_id=f.id order by responded_at desc,id desc limit 1) end,
 'current_revision',case when $6='quotation' then q.current_revision_id=f.id else true end) row
 from filtered f left join public.quotations q on q.organization_id=$1 and q.id=(d->>'quotation_id')::uuid
 ) select row from projected where ($2<>'receivables' or row->>'status'='issued' and (row->>'outstanding')::numeric>0)
 $query$,source.table_name);
 return query execute query using org,report_kind,filters->>'from',filters->>'to',zone,source.kind,(filters->>'projectId')::uuid,(filters->>'customerId')::uuid,(filters->>'assigneeId')::uuid,(filters->>'industryId')::uuid,nullif(filters->>'location',''),nullif(filters->>'status',''),source.family,source.permission;
end loop;return;
end$$;
create function private.report_dimensions(org uuid,kind text,filters jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 with facts as materialized(select value from private.report_rows(org,kind,filters) value),
 dimensions as (
 select 'Lead stage' dimension,coalesce(s.name,'Unassigned') label,count(*) count,null::text currency,null::text value from facts f left join public.crm_pipeline_stages s on s.organization_id=org and s.id=(f.value->>'lead_stage')::uuid where f.value->>'kind'='lead' group by s.name
 union all select 'Lead source',coalesce(s.name,'Unassigned'),count(*),null,null from facts f left join public.lead_sources s on s.organization_id=org and s.id=(f.value->>'lead_source')::uuid where f.value->>'kind'='lead' group by s.name
 union all select 'Industry',coalesce(i.name,'Unassigned'),count(*),null,null from facts f left join public.industries i on i.id=(f.value->>'industry_id')::uuid where f.value->>'kind' in('lead','project') group by i.name
 union all select 'Location',coalesce(nullif(value->>'location',''),'Unspecified'),count(*),null,null from facts where value->>'kind' in('lead','project') group by 2
 union all select 'Current quotation',case when value->>'customer_response'='approved' then 'Accepted' when value->>'customer_response'='declined' then 'Rejected' when value->>'status'='issued' and (value->>'due_date')::date<(filters->>'to')::date then 'Expired' when value->>'status'='issued' then 'Pending' else initcap(value->>'status') end,count(*),value->>'currency',sum((value->>'value')::numeric)::text from facts where value->>'kind'='quotation' and (value->>'current_revision')::boolean group by 2,4
 union all select 'Open work overdue',value->>'kind',count(*),null,null from facts where value->>'kind' in('task','milestone','followup','snag') and value->>'status' not in('done','completed','cancelled','closed','verified') and (value->>'due_date')::date<(filters->>'to')::date group by 2
 ) select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select * from dimensions order by dimension,count desc,label limit 100)d;
$$;
create function public.report_read(p_organization_id uuid,p_kind text,p_filters jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;page integer;project uuid;rows jsonb;total bigint;summary jsonb;aging jsonb;begin
 if private.report_permission(p_kind) is null or not private.has_permission(p_organization_id,private.report_permission(p_kind)) then raise exception 'Unavailable report' using errcode='42501';end if;
 if not private.report_filters(p_filters) then raise exception 'Invalid report filters' using errcode='22023';end if;
 page=coalesce((p_filters->>'page')::integer,1);project=(p_filters->>'projectId')::uuid;
 if p_kind in('inventory','cost') then
 if project is null then raise exception 'Select a project for this cumulative report' using errcode='22023';end if;
 if p_filters ?| array['customerId','assigneeId','industryId','location','status'] then raise exception 'Filter not applicable to this cumulative report' using errcode='22023';end if;
 if p_kind='inventory' then result=public.operations_materials(p_organization_id,project,null,page);
 else result=jsonb_build_object('rows',public.operations_costs(p_organization_id,project)->'rows','commercial',public.execution_cost_dashboard(p_organization_id,project),'total',1,'page',1,'page_size',25,'basis','Cumulative canonical project costs at generation time. Estimated, committed, received, consumed and certified amounts are separate; no accounting profit. Date range does not truncate cumulative cost balances.');end if;
 return result||jsonb_build_object('kind',p_kind,'filters',p_filters,'generated_at',now());
 end if;
 with facts as materialized(select value from private.report_rows(p_organization_id,p_kind,p_filters) value),
 groups as(select value->>'kind' kind,value->>'status' status,value->>'currency' currency,count(*) count,sum((value->>'value')::numeric)::text value,sum((value->>'paid')::numeric)::text paid,sum((value->>'outstanding')::numeric)::text outstanding from facts group by 1,2,3)
 select (select count(*) from facts),coalesce((select jsonb_agg(value order by value->>'created_at' desc,value->>'id') from(select value from facts order by value->>'created_at' desc,value->>'id' limit 25 offset(page-1)*25) paged),'[]'),coalesce((select jsonb_agg(to_jsonb(g) order by kind,status,currency) from groups g),'[]') into total,rows,summary;
 aging='[]';
 if p_kind='receivables' then
 with facts as(select value from private.report_rows(p_organization_id,p_kind,p_filters) value), days as(select value,greatest(0,(p_filters->>'to')::date-(value->>'due_date')::date) days from facts), labeled as(
 select value,case when value->>'due_date' is null then 'No due date' when days=0 then 'Current' else coalesce((select 'Up to '||b.value||' days' from jsonb_array_elements_text(coalesce(p_filters->'agingBuckets','[30,60,90]')) b(value) where days<=b.value::integer order by b.value::integer limit 1),'Older') end bucket from days)
 select coalesce(jsonb_agg(to_jsonb(a)),'[]') into aging from(select bucket,value->>'currency' currency,count(*) count,sum((value->>'outstanding')::numeric)::text outstanding from labeled group by 1,2 order by 1,2)a;
 end if;
 return jsonb_build_object('kind',p_kind,'filters',p_filters,'rows',rows,'total',total,'page',page,'page_size',25,'summary',summary,'aging',aging,'dimensions',private.report_dimensions(p_organization_id,p_kind,p_filters),'generated_at',now(),'basis',case when p_kind='receivables' then 'Currently outstanding issued invoices created on or before the end date; aging uses that date. Current payment allocations are used, so this is not a reconstructed historical ledger.' else 'Records created within the selected organization-local dates, with current source status and current canonical values. Summaries are grouped by source kind, status and currency; these amounts must not be added across kinds. Quote revisions include superseded revisions, explicitly marked. Pending quotes are not revenue. Dimension breakdowns show at most 100 groups, ordered by dimension and count.' end);
end$$;
revoke all on function private.report_permission(text),private.report_filters(jsonb),private.report_rows(uuid,text,jsonb),public.report_read(uuid,text,jsonb) from public,anon,authenticated,business_os_worker;
revoke all on function private.report_dimensions(uuid,text,jsonb) from public,anon,authenticated,business_os_worker;
grant execute on function public.report_read(uuid,text,jsonb) to authenticated;
commit;


