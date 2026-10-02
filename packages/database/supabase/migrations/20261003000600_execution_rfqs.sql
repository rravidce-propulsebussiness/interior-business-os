begin;
create function public.execution_rfq_create(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare pr public.purchase_requisitions;existing public.rfqs;vendor public.vendors;item public.purchase_requisition_items;entry jsonb;target uuid;amount numeric;ordinal integer=0;begin
 perform private.execution_require(p_organization_id,'rfq.create');
 perform private.execution_require(p_organization_id,'vendor.view');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>100000 or p_input-array['requisition_id','idempotency_key','vendor_ids','items','required_date','delivery_location','notes']<>'{}'::jsonb or jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_typeof(p_input->'vendor_ids') is distinct from 'array' then raise exception 'Invalid RFQ' using errcode='22023';end if;
 if jsonb_array_length(p_input->'items') not between 1 and 500 or jsonb_array_length(p_input->'vendor_ids') not between 1 and 25 or p_input->>'idempotency_key' is null then raise exception 'RFQ requires items, vendors and retry key' using errcode='22023';end if;
 select * into existing from public.rfqs where organization_id=p_organization_id and idempotency_key=(p_input->>'idempotency_key')::uuid;
 if existing.id is not null then if existing.request_hash<>md5(p_input::text) then raise exception 'RFQ retry payload differs' using errcode='22023';end if;return existing.id;end if;
 select * into pr from public.purchase_requisitions where organization_id=p_organization_id and id=(p_input->>'requisition_id')::uuid and status='approved' for update;
 if pr.id is null then raise exception 'Approved requisition required' using errcode='22023';end if;
 if not exists(select 1 from public.contracts where id=pr.contract_id and status not in ('closed','cancelled')) then raise exception 'Open contract required' using errcode='22023';end if;
 insert into public.rfqs(organization_id,contract_id,project_id,requisition_id,rfq_number,required_date,delivery_location,notes,idempotency_key,request_hash)
 values(p_organization_id,pr.contract_id,pr.project_id,pr.id,private.finance_number(p_organization_id,'rfq','RFQ'),coalesce((p_input->>'required_date')::date,pr.required_date),coalesce(p_input->>'delivery_location',pr.delivery_location),coalesce(p_input->>'notes',''),(p_input->>'idempotency_key')::uuid,md5(p_input::text)) returning id into target;
 for entry in select jsonb_array_elements(p_input->'vendor_ids') loop
 if jsonb_typeof(entry)<>'string' then raise exception 'Invalid vendor selection' using errcode='22023';end if;
 select * into vendor from public.vendors where organization_id=p_organization_id and id=(entry#>>'{}')::uuid and status='active';
 if vendor.id is null then raise exception 'Unavailable active vendor' using errcode='42501';end if;
 insert into public.rfq_vendors(organization_id,rfq_id,vendor_id,vendor_snapshot) values(p_organization_id,target,vendor.id,jsonb_build_object('id',vendor.id,'name',vendor.name,'legal_name',vendor.legal_name,'phone',vendor.phone,'email',vendor.email,'billing_address',vendor.billing_address,'tax_identifier',vendor.tax_identifier));end loop;
 for entry in select jsonb_array_elements(p_input->'items') loop
 if jsonb_typeof(entry) is distinct from 'object' or entry-array['requisition_item_id','quantity']<>'{}'::jsonb then raise exception 'Invalid RFQ item' using errcode='22023';end if;
 select * into item from public.purchase_requisition_items where organization_id=p_organization_id and requisition_id=pr.id and id=(entry->>'requisition_item_id')::uuid;
 if item.id is null then raise exception 'Unavailable requisition item' using errcode='42501';end if;
 amount=private.execution_decimal(entry->>'quantity');
 if amount<=0 or amount>item.quantity::numeric then raise exception 'RFQ quantity exceeds approved requisition item' using errcode='22023';end if;
 if mod(amount*1000000,private.execution_decimal(item.snapshot#>>'{conversion,purchase_increment}')*1000000)<>0 then raise exception 'RFQ quantity must respect purchase increment' using errcode='22023';end if;
 insert into public.rfq_items(organization_id,rfq_id,requisition_item_id,description,unit,quantity,snapshot,sort_order) values(p_organization_id,target,item.id,item.description,item.unit,trim_scale(amount)::text,item.snapshot,ordinal);ordinal=ordinal+1;end loop;
 perform private.crm_audit(p_organization_id,'rfq.created','rfqs',target);return target;
end$$;
create function public.execution_rfq_transition(p_organization_id uuid,p_id uuid,p_version integer,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rfqs;document jsonb;begin
 perform private.execution_require(p_organization_id,'rfq.manage');
 if p_action is null or p_action not in ('issue','close','cancel') then raise exception 'Invalid RFQ transition' using errcode='22023';end if;
 select * into r from public.rfqs where organization_id=p_organization_id and id=p_id for update;
 if r.id is null then raise exception 'Unavailable RFQ' using errcode='42501';end if;
 if p_action='issue' and r.status='issued' or p_action='close' and r.status='closed' or p_action='cancel' and r.status='cancelled' then return r.id;end if;
 if r.version is distinct from p_version then raise exception 'Stale RFQ' using errcode='40001';end if;
 if p_action='issue' then
 if r.status<>'draft' or not exists(select 1 from public.purchase_requisitions where id=r.requisition_id and status='approved') then raise exception 'Draft RFQ with approved requisition required' using errcode='22023';end if;
 if not exists(select 1 from public.contracts where id=r.contract_id and status not in ('closed','cancelled')) then raise exception 'Open contract required' using errcode='22023';end if;
 if exists(select 1 from public.rfq_vendors rv join public.vendors v on v.id=rv.vendor_id where rv.rfq_id=r.id and v.status<>'active') then raise exception 'RFQ contains inactive vendors' using errcode='22023';end if;
 select jsonb_build_object('schema_version',1,'kind','rfq','number',r.rfq_number,'issued_at',now(),'required_date',r.required_date,'delivery_location',r.delivery_location,'notes',r.notes,'organization',jsonb_build_object('name',o.name),'project',jsonb_build_object('name',p.name),'items',(select jsonb_agg(jsonb_build_object('description',i.description,'unit',i.unit,'quantity',i.quantity,'specification',i.snapshot) order by i.sort_order,i.id) from public.rfq_items i where i.rfq_id=r.id)) into document from public.organizations o join public.projects p on p.organization_id=o.id and p.id=r.project_id where o.id=p_organization_id;
 update public.rfqs set status='issued',issued_at=now(),document_snapshot=document,version=version+1 where id=r.id;
 elsif p_action='close' then
 if r.status<>'issued' then raise exception 'Issued RFQ required' using errcode='22023';end if;
 update public.rfqs set status='closed',version=version+1 where id=r.id;
 else
 if r.status not in ('draft','issued') or exists(select 1 from public.vendor_quotes where rfq_id=r.id and status not in ('cancelled','declined')) then raise exception 'Resolve vendor quotes before RFQ cancellation' using errcode='22023';end if;
 update public.rfqs set status='cancelled',version=version+1 where id=r.id;end if;
 perform private.crm_audit(p_organization_id,'rfq.'||p_action,'rfqs',r.id);return r.id;
end$$;
revoke all on function public.execution_rfq_create(uuid,jsonb),public.execution_rfq_transition(uuid,uuid,integer,text) from public,anon;
grant execute on function public.execution_rfq_create(uuid,jsonb),public.execution_rfq_transition(uuid,uuid,integer,text) to authenticated;
commit;
