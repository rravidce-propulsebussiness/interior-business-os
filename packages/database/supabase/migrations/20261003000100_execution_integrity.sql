begin;
-- One canonical quantity calculation serves previews and persisted estimates.
create function private.execution_quantity(rule jsonb,measurements jsonb,conversion jsonb,waste text,override_value text default null) returns jsonb language plpgsql immutable set search_path='' as $$
declare basis numeric;factor numeric;base numeric;required numeric;ratio numeric;step numeric;rounded numeric;raw numeric;effective numeric;w numeric;num numeric;den numeric;k text;v jsonb;begin
 if jsonb_typeof(rule) is distinct from 'object' or rule-array['basis','factor']<>'{}'::jsonb or jsonb_typeof(measurements) is distinct from 'object' or octet_length(measurements::text)>4000 then raise exception 'Invalid safe quantity rule' using errcode='22023';end if;
 for k,v in select * from jsonb_each(measurements) loop
 if k not in ('quantity','finished_area','width','height','length','depth','volume','percentage') or jsonb_typeof(v)<>'string' then raise exception 'Invalid measurement' using errcode='22023';end if;
 perform private.execution_decimal(v#>>'{}');end loop;
 factor=private.execution_decimal(rule->>'factor');
 case rule->>'basis'
 when 'fixed' then basis=1;
 when 'volume' then basis=case when measurements ? 'volume' then private.execution_decimal(measurements->>'volume') else private.execution_decimal(measurements->>'width')*private.execution_decimal(measurements->>'height')*private.execution_decimal(measurements->>'length') end;
 when 'percentage' then basis=private.execution_decimal(measurements->>'percentage')*0.01;if basis>1 then raise exception 'Percentage exceeds 100' using errcode='22023';end if;
 when 'quantity','finished_area','width','height','length','depth' then basis=private.execution_decimal(measurements->>(rule->>'basis'));
 else raise exception 'Unsupported quantity basis' using errcode='22023';end case;
 if factor<=0 or basis<=0 then raise exception 'Positive quantity basis required' using errcode='22023';end if;
 ratio=private.execution_decimal(conversion->>'consumption_per_purchase');step=private.execution_decimal(conversion->>'purchase_increment');w=private.execution_decimal(waste);
 if ratio<=0 or step<=0 or w>100 then raise exception 'Invalid conversion, rounding or waste' using errcode='22023';end if;
 base=round(basis*factor,6);required=round(base*(1+w*0.01),6);
 if base<=0 or required>999999999999999999 then raise exception 'Quantity outside supported precision' using errcode='22023';end if;
 -- Integer quotient/remainder avoids a rounded division erasing a tiny remainder.
 num=required*1000000000000;den=ratio*step*1000000000000;
 rounded=(div(num,den)+case when mod(num,den)>0 then 1 else 0 end)*step;raw=round(required/ratio,6);
 effective=case when override_value is null then rounded else private.execution_decimal(override_value) end;
 if effective<=0 or effective>999999999999999999 or mod(effective*1000000,step*1000000)<>0 then raise exception 'Override must be a positive purchase increment' using errcode='22023';end if;
 return jsonb_build_object('schema_version',1,'rule',rule,'measurements',measurements,'conversion',conversion,'waste_percentage',waste,
 'unrounded_base_quantity',trim_scale(basis*factor)::text,'base_quantity',trim_scale(base)::text,'waste_quantity',trim_scale(required-base)::text,'required_quantity',trim_scale(required)::text,
 'calculated_purchase_quantity',trim_scale(raw)::text,'rounded_purchase_quantity',trim_scale(rounded)::text,'override_quantity',override_value,'planned_purchase_quantity',trim_scale(effective)::text,'quantity_precision',6,'rounding','up to purchase increment after explicit conversion');
end$$;
create function public.execution_quantity_preview(p_organization_id uuid,p_rule jsonb,p_measurements jsonb,p_conversion jsonb,p_waste text,p_override text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.execution_access(p_organization_id,'estimate.view') then raise exception 'Forbidden' using errcode='42501';end if;
 return private.execution_quantity(p_rule,p_measurements,p_conversion,p_waste,p_override);
end$$;

create function private.execution_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb=to_jsonb(old);b jsonb=to_jsonb(new);r jsonb=case when tg_op='DELETE' then a else b end;parent_status text;parent_entity text;parent_column text;begin
 if tg_op='UPDATE' and (a->'id' is distinct from b->'id' or a->'organization_id' is distinct from b->'organization_id') then raise exception 'Stable execution identity required' using errcode='23514';end if;
 if tg_table_name in ('material_unit_conversions','goods_receipts','goods_receipt_items') then
 if tg_op<>'INSERT' then raise exception 'Append-only execution history' using errcode='23514';end if;return new;end if;
 if tg_table_name='material_cost_revisions' then
 if tg_op='DELETE' or tg_op='UPDATE' and (a-array['valid_until','version','updated_at'] is distinct from b-array['valid_until','version','updated_at'] or a->>'valid_until' is not null or b->>'valid_until' is null) then raise exception 'Cost revisions preserve history' using errcode='23514';end if;return new;end if;
 if tg_table_name in ('execution_estimate_scope_items','execution_estimate_lines','execution_estimate_line_costs') then parent_entity='execution_estimate_revisions';parent_column='revision_id';
 elsif tg_table_name in ('purchase_requisition_items','purchase_requisition_sources') then parent_entity='purchase_requisitions';parent_column='requisition_id';
 elsif tg_table_name in ('rfq_items','rfq_vendors') then parent_entity='rfqs';parent_column='rfq_id';
 elsif tg_table_name='vendor_quote_items' then parent_entity='vendor_quotes';parent_column='quote_id';
 elsif tg_table_name in ('purchase_order_items','purchase_order_costs','purchase_order_item_costs') then parent_entity='purchase_orders';parent_column='po_id';end if;
 if parent_entity is not null then
 if tg_op='UPDATE' and a->parent_column is distinct from b->parent_column then raise exception 'Stable execution parent required' using errcode='23514';end if;
 execute format('select status from public.%I where organization_id=$1 and id=$2 for update',parent_entity) into parent_status using (r->>'organization_id')::uuid,(r->>parent_column)::uuid;
 if parent_status is distinct from 'draft' then
 if tg_table_name='rfq_vendors' and tg_op='UPDATE' and a-array['response_status','updated_at'] is not distinct from b-array['response_status','updated_at'] and parent_status='issued' then return new;end if;
 raise exception 'Frozen execution lines' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;return new;
 end if;
 if tg_op='DELETE' then raise exception 'Execution records cannot be deleted' using errcode='23514';end if;
 if tg_op='UPDATE' then
 if tg_table_name='execution_estimates' and a-array['next_revision','current_approved_revision_id','version','updated_at'] is distinct from b-array['next_revision','current_approved_revision_id','version','updated_at'] then raise exception 'Frozen estimate identity' using errcode='23514';end if;
 if tg_table_name='execution_estimate_revisions' and a->>'status'<>'draft' then
 if a-array['status','version','reviewed_by','approved_by','approved_at','decision_reason','updated_at'] is distinct from b-array['status','version','reviewed_by','approved_by','approved_at','decision_reason','updated_at'] or
 not(a->>'status'='under_review' and b->>'status' in ('draft','approved','cancelled') or a->>'status'='approved' and b->>'status'='superseded') then raise exception 'Frozen estimate revision' using errcode='23514';end if;
 elsif tg_table_name in ('purchase_requisitions','rfqs','vendor_quotes','purchase_orders') and a->>'status'<>'draft' then
 if a-array['status','version','approved_at','approved_by','decision_reason','cancel_reason','closed_at','updated_at'] is distinct from b-array['status','version','approved_at','approved_by','decision_reason','cancel_reason','closed_at','updated_at'] or a->>'status' in ('cancelled','closed','declined') then raise exception 'Frozen procurement document' using errcode='23514';end if;
 end if;end if;
 return new;
end$$;
do $$declare t text;begin foreach t in array array['material_categories','materials','material_variants','material_unit_conversions','material_cost_revisions','vendors','vendor_contacts','vendor_materials','estimation_recipes','estimation_recipe_items','estimation_recipe_item_costs','execution_estimates','execution_estimate_revisions','execution_estimate_scope_items','execution_estimate_lines','execution_estimate_line_costs','purchase_requisitions','purchase_requisition_items','purchase_requisition_sources','rfqs','rfq_vendors','rfq_items','vendor_quotes','vendor_quote_items','purchase_orders','purchase_order_items','purchase_order_costs','purchase_order_item_costs','goods_receipts','goods_receipt_items'] loop execute format('create trigger execution_guard before insert or update or delete on public.%I for each row execute function private.execution_guard()',t);end loop;end$$;
create index material_category_lookup on public.materials(organization_id,category_id,lower(name) text_pattern_ops,id);
create index vendor_name_lookup on public.vendors(organization_id,lower(name) text_pattern_ops,id);
create index material_variant_lookup on public.material_variants(organization_id,material_id,lower(name) text_pattern_ops,id);
create index material_rate_effective on public.material_cost_revisions(organization_id,variant_id,currency,valid_from desc);
create index execution_project_status on public.execution_estimate_revisions(organization_id,project_id,status,id);
create index execution_scope_lookup on public.execution_estimate_scope_items(organization_id,revision_id,area_id,id);
create index execution_line_lookup on public.execution_estimate_lines(organization_id,revision_id,scope_id,category_id,id);
create index requisition_project_status on public.purchase_requisitions(organization_id,project_id,status,id);
create index requisition_source_line on public.purchase_requisition_sources(organization_id,estimate_line_id,id);
create index rfq_project_status on public.rfqs(organization_id,project_id,status,id);
create index po_vendor_project_status on public.purchase_orders(organization_id,vendor_id,project_id,status,id);
create index po_demand_lookup on public.purchase_order_items(organization_id,requisition_item_id,id);
create index goods_receipt_po_date on public.goods_receipts(organization_id,po_id,receipt_date,id);
create index goods_receipt_item_po on public.goods_receipt_items(organization_id,po_item_id,id);
revoke all on function private.execution_quantity(jsonb,jsonb,jsonb,text,text),private.execution_guard() from public,anon,authenticated;
revoke all on function public.execution_quantity_preview(uuid,jsonb,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.execution_quantity_preview(uuid,jsonb,jsonb,jsonb,text,text) to authenticated;
commit;
