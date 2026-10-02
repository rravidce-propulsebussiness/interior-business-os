begin;
create function public.operations_document(p_organization_id uuid,p_kind text,p_id uuid,p_filter jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare project uuid;permission text;header jsonb;source jsonb;rows jsonb='[]';columns jsonb;title text;page integer;report jsonb;begin
 if jsonb_typeof(p_filter) is distinct from 'object' or p_filter-array['area_id','location_id','variant_id','from','until','kind']<>'{}'::jsonb or octet_length(p_filter::text)>2000 then raise exception 'Invalid document filters' using errcode='22023';end if;
 if p_kind in ('material_issue','inventory_movement') and p_filter='{}'::jsonb then
  select project_id,document_snapshot into project,source from public.inventory_transactions where organization_id=p_organization_id and id=p_id and (p_kind='inventory_movement' or kind='issue_to_site');permission='inventory.view';title=case when p_kind='material_issue' then 'Material Issue Slip' else 'Inventory Movement' end;
  columns='["Material","Quantity","Unit","From","To"]';rows=jsonb_build_array(jsonb_build_array(source->>'material',source->>'quantity',source->>'unit',source->>'source',source->>'destination'));
 elsif p_kind='inspection' then
  select project_id,document_snapshot into project,source from public.project_inspections where organization_id=p_organization_id and id=p_id and approved_at is not null;permission='inspection.view';title='Inspection Report';columns='["Check","Result","Note"]';
  select coalesce(jsonb_agg(jsonb_build_array(x->>'label',x->>'result',x->>'note')),'[]') into rows from jsonb_array_elements(source->'checklist')x;
 elsif p_kind='handover' then
  select project_id,document_snapshot into project,source from public.handover_records where organization_id=p_organization_id and id=p_id and status='approved';permission='handover.view';title='Handover Certificate';columns='["Handover item","Result","Note"]';
  select coalesce(jsonb_agg(jsonb_build_array(x->>'label',x->>'result',x->>'note')),'[]') into rows from jsonb_array_elements(source->'checklist')x;
 elsif p_kind='work_order' then
  select project_id,document_snapshot into project,source from public.subcontractor_work_orders where organization_id=p_organization_id and id=p_id and status<>'draft';permission='subcontractor.view';title='Subcontractor Work Order';columns='["Work","Scope","Quantity","Unit"]';rows=jsonb_build_array(jsonb_build_array(source->>'title',source->>'scope',source->>'quantity',source->>'unit'));
 elsif p_kind in ('consumption','snag','movement_report','completion') then
  project=p_id;permission=case when p_kind in ('consumption','movement_report') then 'inventory.view' when p_kind='snag' then 'snag.view' else 'execution.view' end;
  if not private.ops_access(p_organization_id,permission,project) then raise exception 'Unavailable document' using errcode='42501';end if;
  source=private.execution_document_header(p_organization_id,project)||jsonb_build_object('number',upper(p_kind)||'-'||current_date::text,'date',current_date);
  if p_kind='consumption' then
   title='Project Material Consumption';columns='["Category / Material","Unit","Estimated","Purchased","Received","Issued","Consumed","Returned","Scrap","Variance"]';
   for page in 1..20 loop
    report=public.operations_materials(p_organization_id,project,(p_filter->>'area_id')::uuid,page);
    if (report->>'total')::integer>500 then raise exception 'Narrow report to at most 500 material rows' using errcode='22023';end if;
    select rows||coalesce(jsonb_agg(jsonb_build_array(concat_ws(' / ',x->>'category',x->>'material'),x->>'unit',x->>'estimated',x->>'purchased',x->>'received',x->>'issued',x->>'consumed',x->>'returned',x->>'scrapped',x->>'variance')),'[]') into rows from jsonb_array_elements(report->'rows')x;
    exit when page*25>=(report->>'total')::integer;
   end loop;
   source=source||jsonb_build_object('notes',report->>'basis');
  elsif p_kind='snag' then
   title='Snag / Punch List Report';columns='["Area / Issue","Priority","Assigned","Status","Due","Resolution","Verification"]';
   select coalesce(jsonb_agg(jsonb_build_array(concat_ws(' / ',a.name,s.title),s.priority,coalesce(p.full_name,v.name,''),s.status,s.due_date::text,s.resolution,s.verification) order by s.created_at,s.id),'[]') into rows from public.project_snags s left join public.project_areas a on a.id=s.area_id left join public.profiles p on p.id=s.assigned_to left join public.vendors v on v.id=s.vendor_id where s.organization_id=p_organization_id and s.project_id=project and (p_filter->>'area_id' is null or s.area_id=(p_filter->>'area_id')::uuid);
  elsif p_kind='movement_report' then
   title='Inventory Movement Report';columns='["Date","Movement","Material","Location","Quantity","Unit","Reason"]';
   select coalesce(jsonb_agg(jsonb_build_array(t.movement_date::text,t.kind,lot.label,l.name,m.quantity,lot.unit,t.reason) order by t.movement_date,t.created_at,m.id),'[]') into rows from public.inventory_movements m join public.inventory_transactions t on t.id=m.transaction_id join public.inventory_lots lot on lot.id=m.lot_id join public.inventory_locations l on l.id=m.location_id where t.organization_id=p_organization_id and t.project_id=project and (p_filter->>'location_id' is null or m.location_id=(p_filter->>'location_id')::uuid) and (p_filter->>'variant_id' is null or lot.variant_id=(p_filter->>'variant_id')::uuid) and (p_filter->>'from' is null or t.movement_date>=(p_filter->>'from')::date) and (p_filter->>'until' is null or t.movement_date<=(p_filter->>'until')::date) and (p_filter->>'kind' is null or t.kind=p_filter->>'kind');
  else
   title='Internal Project Completion Report';columns='["Check","Result"]';report=public.operations_closure(p_organization_id,project);
   select coalesce(jsonb_agg(jsonb_build_array(replace(key,'_',' '),value)),'[]') into rows from jsonb_each_text(report-'commercial'-'readiness') where key<>'project_id';
   select rows||coalesce(jsonb_agg(jsonb_build_array(replace(key,'_',' '),value)),'[]') into rows from jsonb_each_text(report->'readiness');
   source=source||jsonb_build_object('notes','Internal operational completion review. Financial closure remains separate.');
  end if;
 else raise exception 'Unsupported operational document' using errcode='22023';end if;
 if source is null or not private.ops_access(p_organization_id,permission,project) or project is null and not private.has_permission(p_organization_id,'inventory.view_all') then raise exception 'Unavailable document' using errcode='42501';end if;
 if jsonb_array_length(rows)>500 then raise exception 'Narrow report filters to at most 500 rows' using errcode='22023';end if;
 header=jsonb_build_object('schema_version',1,'kind',p_kind,'title',title,'number',source->>'number','date',coalesce(source->>'date',current_date::text),'business',source->'business','project',source->'project','customer',source->>'customer','notes',coalesce(source->>'notes',source->>'reason',''),'acknowledgement',source->>'acknowledgement','prepared_by',coalesce(source->>'prepared_by',source->>'issued_by',source->>'inspector'),'approved_by',source->>'approved_by','received_by',source->>'received_by','result',source->>'result','warranty_start',source->>'warranty_start','warranty_end',source->>'warranty_end','columns',columns,'rows',rows);
 return header;
end$$;
revoke all on function public.operations_document(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.operations_document(uuid,text,uuid,jsonb) to authenticated;
commit;
