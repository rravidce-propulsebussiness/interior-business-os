begin;
create function private.execution_document_header(org uuid,project uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('business',jsonb_build_object('name',o.name,'legal_name',coalesce(o.legal_name,''),'address',coalesce(q.branding->'address','{}'),'phone',coalesce(q.branding->>'phone',''),'email',coalesce(q.branding->>'email',''),'tax_identifier',coalesce(q.branding->>'tax_identifier',''),'logo_data_uri',q.branding->>'logo_data_uri'),'project',jsonb_build_object('name',p.name,'code',p.code,'site_address',p.site_address)) from public.organizations o join public.projects p on p.organization_id=o.id and p.id=project left join public.organization_quotation_settings q on q.organization_id=o.id where o.id=org;
$$;
create function private.execution_enrich_document() returns trigger language plpgsql security definer set search_path='' as $$
declare project uuid;items jsonb;begin
 if new.document_snapshot is null then return new;end if;
 if tg_op='UPDATE' and new.document_snapshot is not distinct from old.document_snapshot then return new;end if;
 if tg_table_name='purchase_order_costs' then select project_id into project from public.purchase_orders where id=new.po_id;
 else project=(to_jsonb(new)->>'project_id')::uuid;end if;
 new.document_snapshot=new.document_snapshot||private.execution_document_header(new.organization_id,project);
 if tg_table_name='goods_receipts' then
 select jsonb_agg(x||jsonb_build_object('ordered_quantity',i.quantity) order by n) into items from jsonb_array_elements(new.document_snapshot->'items') with ordinality a(x,n) join public.purchase_order_items i on i.id=(x->>'po_item_id')::uuid and i.po_id=new.po_id;
 new.document_snapshot=jsonb_set(new.document_snapshot,'{items}',coalesce(items,'[]'));end if;
 return new;
end$$;
create trigger execution_document_enrichment before insert or update on public.rfqs for each row execute function private.execution_enrich_document();
create trigger execution_document_enrichment before insert or update on public.purchase_order_costs for each row execute function private.execution_enrich_document();
create trigger execution_document_enrichment before insert on public.goods_receipts for each row execute function private.execution_enrich_document();
create table public.execution_estimate_documents(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),revision_id uuid not null,
 document_snapshot jsonb not null,created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(revision_id),foreign key(organization_id,revision_id) references public.execution_estimate_revisions(organization_id,id));
alter table public.execution_estimate_documents enable row level security;alter table public.execution_estimate_documents force row level security;
revoke all on public.execution_estimate_documents from public,anon,authenticated;grant select on public.execution_estimate_documents to authenticated;
create policy execution_document_read on public.execution_estimate_documents for select to authenticated using(private.execution_access(organization_id,'estimate.view') and private.execution_access(organization_id,'estimate.view_cost'));
create function private.execution_estimate_document(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.execution_document_header(r.organization_id,r.project_id)||jsonb_build_object('schema_version',1,'kind','execution_estimate','number',e.estimate_number,'revision',r.revision_number,'status',r.status,'date',r.created_at::date,'currency',c.currency,'precision',c.precision,'notes',r.notes,'contract_number',c.contract_number,
 'scope',(select coalesce(jsonb_agg(jsonb_build_object('name',s.snapshot->>'name','area',s.area_name,'coverage',s.coverage,'exclusion_reason',s.exclusion_reason,'source_type',s.source_type) order by s.sort_order,s.id),'[]') from public.execution_estimate_scope_items s where s.revision_id=r.id),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('description',l.description,'scope',s.snapshot->>'name','area',s.area_name,'cost_kind',l.cost_kind,'base_quantity',l.base_quantity,'waste_quantity',l.waste_quantity,'required_quantity',l.required_quantity,'calculated_purchase_quantity',l.calculated_purchase_quantity,'rounded_purchase_quantity',l.rounded_purchase_quantity,'override_quantity',l.override_quantity,'override_reason',l.override_reason,'quantity',l.planned_purchase_quantity,'unit',l.purchase_unit,'consumption_unit',l.consumption_unit,'unit_price',lc.unit_cost,'total',lc.estimated_cost,'accuracy',l.accuracy) order by s.sort_order,l.sort_order,l.id),'[]') from public.execution_estimate_lines l join public.execution_estimate_scope_items s on s.id=l.scope_id left join public.execution_estimate_line_costs lc on lc.line_id=l.id where l.revision_id=r.id and s.coverage='estimated'),
 'total',(select case when count(l.id)=count(lc.id) then trim_scale(coalesce(sum(lc.estimated_cost::numeric),0))::text end from public.execution_estimate_lines l join public.execution_estimate_scope_items s on s.id=l.scope_id left join public.execution_estimate_line_costs lc on lc.line_id=l.id where l.revision_id=r.id and s.coverage='estimated'))
 from public.execution_estimate_revisions r join public.execution_estimates e on e.id=r.estimate_id join public.contracts c on c.id=r.contract_id where r.id=target;
$$;
create function private.execution_freeze_estimate_document() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='approved' and old.status<>'approved' then insert into public.execution_estimate_documents(organization_id,revision_id,document_snapshot) values(new.organization_id,new.id,private.execution_estimate_document(new.id));end if;return new;
end$$;
create trigger execution_freeze_document after update on public.execution_estimate_revisions for each row execute function private.execution_freeze_estimate_document();
create function private.execution_document_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Execution document history is immutable' using errcode='23514';end$$;
create trigger execution_document_immutable before update or delete on public.execution_estimate_documents for each row execute function private.execution_document_immutable();
create or replace function public.execution_document(p_organization_id uuid,p_entity text,p_id uuid,p_vendor_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare document jsonb;vendor jsonb;begin
 if p_entity='execution_estimate_revisions' then
 if not private.execution_access(p_organization_id,'estimate.view_cost') or not private.execution_access(p_organization_id,'estimate.view') then raise exception 'Unavailable internal estimate document' using errcode='42501';end if;
 select document_snapshot into document from public.execution_estimate_documents where organization_id=p_organization_id and revision_id=p_id;
 if document is null and exists(select 1 from public.execution_estimate_revisions where organization_id=p_organization_id and id=p_id and status in ('draft','under_review')) then document=private.execution_estimate_document(p_id);end if;
 elsif p_entity='purchase_orders' then
 if not private.execution_access(p_organization_id,'purchase_order.view_cost') then raise exception 'Unavailable purchase order document' using errcode='42501';end if;
 select pc.document_snapshot into document from public.purchase_orders po join public.purchase_order_costs pc on pc.po_id=po.id where po.organization_id=p_organization_id and po.id=p_id and po.issued_at is not null;
 elsif p_entity='rfqs' then
 if not private.execution_access(p_organization_id,'rfq.view') then raise exception 'Unavailable RFQ document' using errcode='42501';end if;
 select document_snapshot into document from public.rfqs where organization_id=p_organization_id and id=p_id and issued_at is not null;
 select vendor_snapshot into vendor from public.rfq_vendors where organization_id=p_organization_id and rfq_id=p_id and vendor_id=p_vendor_id;
 if vendor is null then raise exception 'Selected RFQ recipient required' using errcode='42501';end if;document=document||jsonb_build_object('vendor',vendor);
 elsif p_entity='goods_receipts' then
 if not private.execution_access(p_organization_id,'goods_receipt.view') then raise exception 'Unavailable receipt document' using errcode='42501';end if;
 select document_snapshot into document from public.goods_receipts where organization_id=p_organization_id and id=p_id;
 else raise exception 'Unsupported execution document' using errcode='22023';end if;
 if document is null then raise exception 'Unavailable issued document' using errcode='42501';end if;return document;
end$$;
revoke all on function private.execution_document_header(uuid,uuid),private.execution_enrich_document(),private.execution_estimate_document(uuid),private.execution_freeze_estimate_document(),private.execution_document_immutable() from public,anon,authenticated;
commit;
