begin;
create function public.execution_search(p_organization_id uuid,p_entity text,p_filter jsonb default '{}',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare permission text;rows jsonb;total bigint;begin
 permission=private.execution_read_permission(p_entity);
 if permission is null or not private.execution_access(p_organization_id,permission) then raise exception 'Unavailable execution records' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 or jsonb_typeof(p_filter) is distinct from 'object' or octet_length(p_filter::text)>2000 or p_filter-array['project_id','contract_id','revision_id','scope_id','material_id','variant_id','vendor_id','recipe_id','requisition_id','rfq_id','quote_id','po_id','status','query']<>'{}'::jsonb then raise exception 'Invalid execution search' using errcode='22023';end if;
 execute format('select count(*) from public.%I t where t.organization_id=$1 and not exists(select 1 from jsonb_each_text($2-''query'') f where to_jsonb(t)->>f.key is distinct from f.value) and ($2->>''query'' is null or concat_ws('' '',to_jsonb(t)->>''name'',to_jsonb(t)->>''code'',to_jsonb(t)->>''description'',to_jsonb(t)->>''estimate_number'',to_jsonb(t)->>''requisition_number'',to_jsonb(t)->>''rfq_number'',to_jsonb(t)->>''po_number'',to_jsonb(t)->>''receipt_number'',to_jsonb(t)->>''reference'') ilike ''%%''||replace(replace(replace($2->>''query'',''\'',''\\''),''%%'',''\%%''),''_'',''\_'')||''%%'')',p_entity) into total using p_organization_id,p_filter;
 execute format('select coalesce(jsonb_agg(row),''[]'') from (select to_jsonb(t) row from public.%I t where t.organization_id=$1 and not exists(select 1 from jsonb_each_text($2-''query'') f where to_jsonb(t)->>f.key is distinct from f.value) and ($2->>''query'' is null or concat_ws('' '',to_jsonb(t)->>''name'',to_jsonb(t)->>''code'',to_jsonb(t)->>''description'',to_jsonb(t)->>''estimate_number'',to_jsonb(t)->>''requisition_number'',to_jsonb(t)->>''rfq_number'',to_jsonb(t)->>''po_number'',to_jsonb(t)->>''receipt_number'',to_jsonb(t)->>''reference'') ilike ''%%''||replace(replace(replace($2->>''query'',''\'',''\\''),''%%'',''\%%''),''_'',''\_'')||''%%'') order by t.created_at desc,t.id limit 25 offset $3)x',p_entity) into rows using p_organization_id,p_filter,(p_page-1)*25;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end$$;
create function public.execution_detail(p_organization_id uuid,p_entity text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare permission text;result jsonb;begin
 permission=private.execution_read_permission(p_entity);
 if permission is null or not private.execution_access(p_organization_id,permission) then raise exception 'Unavailable execution record' using errcode='42501';end if;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',p_entity) into result using p_organization_id,p_id;
 if result is null then raise exception 'Unavailable execution record' using errcode='42501';end if;
 return result;
end$$;
create function public.execution_contracts(p_organization_id uuid,p_project_id uuid default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.execution_access(p_organization_id,'estimate.view') then raise exception 'Unavailable execution contracts' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid contract page' using errcode='22023';end if;
 select coalesce(jsonb_agg(row),'[]') into result from (select jsonb_build_object('id',c.id,'contract_number',c.contract_number,'project_id',c.project_id,'project_name',p.name,'currency',c.currency,'precision',c.precision,'status',c.status) row from public.contracts c join public.projects p on p.id=c.project_id where c.organization_id=p_organization_id and (p_project_id is null or c.project_id=p_project_id) order by c.created_at desc,c.id limit 25 offset (p_page-1)*25)x;
 return jsonb_build_object('rows',result,'page',p_page,'page_size',25,'total',(select count(*) from public.contracts where organization_id=p_organization_id and (p_project_id is null or project_id=p_project_id)));
end$$;
create function public.execution_document(p_organization_id uuid,p_entity text,p_id uuid,p_vendor_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare document jsonb;vendor jsonb;begin
 if p_entity='purchase_orders' then
 if not private.execution_access(p_organization_id,'purchase_order.view_cost') then raise exception 'Unavailable purchase order document' using errcode='42501';end if;
 select pc.document_snapshot into document from public.purchase_orders po join public.purchase_order_costs pc on pc.po_id=po.id where po.organization_id=p_organization_id and po.id=p_id and po.issued_at is not null;
 elsif p_entity='rfqs' then
 if not private.execution_access(p_organization_id,'rfq.view') then raise exception 'Unavailable RFQ document' using errcode='42501';end if;
 select document_snapshot into document from public.rfqs where organization_id=p_organization_id and id=p_id and issued_at is not null;
 select vendor_snapshot into vendor from public.rfq_vendors where organization_id=p_organization_id and rfq_id=p_id and vendor_id=p_vendor_id;
 if vendor is null then raise exception 'Selected RFQ recipient required' using errcode='42501';end if;
 document=document||jsonb_build_object('vendor',vendor);
 elsif p_entity='goods_receipts' then
 if not private.execution_access(p_organization_id,'goods_receipt.view') then raise exception 'Unavailable receipt document' using errcode='42501';end if;
 select document_snapshot into document from public.goods_receipts where organization_id=p_organization_id and id=p_id;
 else raise exception 'Unsupported execution document' using errcode='22023';end if;
 if document is null then raise exception 'Unavailable issued document' using errcode='42501';end if;return document;
end$$;
revoke all on function public.execution_search(uuid,text,jsonb,integer),public.execution_detail(uuid,text,uuid),public.execution_contracts(uuid,uuid,integer),public.execution_document(uuid,text,uuid,uuid) from public,anon;
grant execute on function public.execution_search(uuid,text,jsonb,integer),public.execution_detail(uuid,text,uuid),public.execution_contracts(uuid,uuid,integer),public.execution_document(uuid,text,uuid,uuid) to authenticated;
commit;
