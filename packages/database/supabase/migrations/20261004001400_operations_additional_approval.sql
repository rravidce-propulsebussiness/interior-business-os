begin;
create or replace function public.operations_issue_request(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;r public.material_issue_requests;target uuid;project uuid;item jsonb;approved numeric;total numeric=0;begin
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>60000 or p_input-array['id','version','project_id','source_location_id','destination_location_id','reason','items']<>'{}'::jsonb or p_operation not in ('create','submit','approve','reject','cancel') then raise exception 'Invalid issue request' using errcode='22023';end if;
 perform private.ops_require(org,case when p_operation in ('approve','reject') then 'material_issue.approve' else 'material_issue.request' end);
 if p_operation='create' then
 project=(p_input->>'project_id')::uuid;
 if not private.ops_project(org,project) then raise exception 'Unavailable project' using errcode='42501';end if;
 if not exists(select 1 from public.inventory_locations where organization_id=org and id=(p_input->>'source_location_id')::uuid and active and kind<>'project_site') or not exists(select 1 from public.inventory_locations where organization_id=org and id=(p_input->>'destination_location_id')::uuid and active and site_project_id=project) then raise exception 'Active store and matching project site required' using errcode='23514';end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Request requires bounded items' using errcode='22023';end if;
 insert into public.material_issue_requests(organization_id,project_id,request_number,source_location_id,destination_location_id,reason) values(org,project,private.finance_number(org,'material_request','MIR'),(p_input->>'source_location_id')::uuid,(p_input->>'destination_location_id')::uuid,p_input->>'reason') returning id into target;
 for item in select jsonb_array_elements(p_input->'items') loop
 if item-array['variant_id','unit','quantity']<>'{}'::jsonb or not exists(select 1 from public.material_variants v join public.material_unit_conversions c on c.id=v.active_conversion_id where v.organization_id=org and v.id=(item->>'variant_id')::uuid and v.status='active' and c.purchase_unit=item->>'unit') then raise exception 'Invalid requested material or unit' using errcode='22023';end if;
 insert into public.material_issue_request_items(organization_id,project_id,request_id,variant_id,unit,quantity) values(org,project,target,(item->>'variant_id')::uuid,item->>'unit',item->>'quantity');end loop;
 perform private.ops_event(org,project,'material_issue_requests',target,'inventory.request_created');return target;
 end if;
 select * into r from public.material_issue_requests where organization_id=org and id=(p_input->>'id')::uuid for update;
 if r.id is null or not private.ops_project(org,r.project_id) then raise exception 'Unavailable issue request' using errcode='42501';end if;
 if r.version is distinct from (p_input->>'version')::integer then raise exception 'Stale request version' using errcode='40001';end if;
 if p_operation='submit' and r.status='draft' then update public.material_issue_requests set status='submitted',version=version+1 where id=r.id;
 elsif p_operation='approve' and r.status in ('submitted','approved','partially_issued') then
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items')<>(select count(*) from public.material_issue_request_items where request_id=r.id) then raise exception 'Review every requested item' using errcode='22023';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_input->'items')x)<>jsonb_array_length(p_input->'items') then raise exception 'Duplicate approval item' using errcode='22023';end if;
 for item in select jsonb_array_elements(p_input->'items') loop
 approved=private.execution_decimal(item->>'approved_quantity');
 if approved < coalesce((select approved_quantity::numeric from public.material_issue_request_items where organization_id=org and request_id=r.id and id=(item->>'id')::uuid),0) then raise exception 'Additional approval cannot revoke already approved demand' using errcode='23514';end if;
 if item-array['id','approved_quantity']<>'{}'::jsonb then raise exception 'Invalid approval fields' using errcode='22023';end if;
 update public.material_issue_request_items set approved_quantity=trim_scale(approved)::text where organization_id=org and request_id=r.id and id=(item->>'id')::uuid;
 if not found then raise exception 'Unknown requested item' using errcode='42501';end if;total=total+approved;end loop;
 if total=0 then raise exception 'Approve a positive quantity or reject the request' using errcode='23514';end if;
 update public.material_issue_requests set status=case when r.status='partially_issued' then 'partially_issued' else 'approved' end,approved_by=auth.uid(),approved_at=now(),version=version+1 where id=r.id;
 elsif p_operation in ('reject','cancel') and r.status in ('draft','submitted','approved') then
 if length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Reason required' using errcode='22023';end if;
 update public.material_issue_requests set status=case when p_operation='reject' then 'rejected' else 'cancelled' end,version=version+1 where id=r.id;
 else raise exception 'Invalid issue request transition' using errcode='40001';end if;
 perform private.ops_event(org,r.project_id,'material_issue_requests',r.id,'inventory.request_'||p_operation,r.status,null,coalesce(p_input->>'reason',''));return r.id;
end$$;
commit;
