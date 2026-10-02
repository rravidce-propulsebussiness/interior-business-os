begin;
create or replace function public.execution_line_save(p_organization_id uuid,p_revision_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.execution_estimate_revisions;s public.execution_estimate_scope_items;c public.contracts;
 v public.material_variants;m public.materials;conversion public.material_unit_conversions;
 recipe public.estimation_recipe_items;recipe_header public.estimation_recipes;
 rate public.material_cost_revisions;service_rate public.estimation_recipe_item_costs;
 previous_line public.execution_estimate_lines;previous_cost public.execution_estimate_line_costs;target uuid;variant uuid;category uuid;kind text;method text;description text;unit text;
 rule jsonb;measurements jsonb;conversion_snapshot jsonb;calculation jsonb;rate_snapshot jsonb;
 waste text;unit_cost numeric;cost_date date;cost numeric;waste_cost numeric;begin
 perform private.execution_require(p_organization_id,'estimate.edit');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 or
 p_input-array['id','version','scope_id','variant_id','category_id','cost_kind','method','description','unit','rule','measurements','waste_percentage','override_quantity','override_reason','recipe_item_id','recipe_reason','accuracy','drawing_reference','measurement_note','site_measurement_version','notes','sort_order','cost_revision_id','cost_date','manual_cost']<>'{}'::jsonb then raise exception 'Invalid estimate line' using errcode='22023';end if;
 select * into r from public.execution_estimate_revisions where organization_id=p_organization_id and id=p_revision_id for update;
 if r.id is null then raise exception 'Unavailable estimate' using errcode='42501';end if;
 if r.status<>'draft' or r.version is distinct from (p_input->>'version')::integer then raise exception 'Current draft revision required' using errcode='40001';end if;
 select * into c from public.contracts where id=r.contract_id;
 if c.status in ('closed','cancelled') then raise exception 'Contract is closed' using errcode='22023';end if;
 select * into s from public.execution_estimate_scope_items where organization_id=p_organization_id and revision_id=r.id and id=(p_input->>'scope_id')::uuid and coverage<>'removed';
 if s.id is null then raise exception 'Unavailable active scope' using errcode='42501';end if;
 target=(p_input->>'id')::uuid;
 if target is not null and not exists(select 1 from public.execution_estimate_lines where id=target and revision_id=r.id and scope_id=s.id) then raise exception 'Unavailable estimate line' using errcode='42501';end if;
 if target is null and (select count(*) from public.execution_estimate_lines where revision_id=r.id)>=1000 then raise exception 'Estimate line limit reached' using errcode='22023';end if;
 method=coalesce(p_input->>'method','manual');variant=(p_input->>'variant_id')::uuid;category=(p_input->>'category_id')::uuid;
 kind=coalesce(p_input->>'cost_kind','material');description=coalesce(p_input->>'description','');unit=coalesce(p_input->>'unit','each');rule=p_input->'rule';
 if method='recipe' then
 select * into recipe from public.estimation_recipe_items where organization_id=p_organization_id and id=(p_input->>'recipe_item_id')::uuid and active;
 select * into recipe_header from public.estimation_recipes where organization_id=p_organization_id and id=recipe.recipe_id and status='active';
 if recipe_header.id is null then raise exception 'Unavailable active recipe' using errcode='42501';end if;
 if s.suggested_recipe_id is distinct from recipe.recipe_id and recipe_header.override_reason_required and length(trim(coalesce(p_input->>'recipe_reason','')))<3 then raise exception 'Recipe selection reason required' using errcode='22023';end if;
 variant=recipe.variant_id;category=recipe.category_id;kind=recipe.cost_kind;description=recipe.description;unit=recipe.unit;rule=recipe.rule;
 elsif method not in ('manual','rule') then raise exception 'Unsupported estimation method' using errcode='22023';end if;
 if rule is null then raise exception 'Explicit safe quantity rule required' using errcode='22023';end if;
 if method='manual' and rule->>'basis' is distinct from 'fixed' then raise exception 'Manual quantity uses fixed basis' using errcode='22023';end if;
 if kind='material' then
 select * into v from public.material_variants where organization_id=p_organization_id and id=variant and status='active';
 select * into m from public.materials where organization_id=p_organization_id and id=v.material_id and status='active';
 select * into conversion from public.material_unit_conversions where organization_id=p_organization_id and id=v.active_conversion_id;
 if m.id is null or conversion.id is null then raise exception 'Active material and explicit unit conversion required' using errcode='22023';end if;
 category=m.category_id;conversion_snapshot=to_jsonb(conversion)-array['created_by','created_at','updated_at'];
 else
 if variant is not null or length(trim(unit)) not between 1 and 40 then raise exception 'Invalid service units' using errcode='22023';end if;
 conversion_snapshot=jsonb_build_object('purchase_unit',unit,'consumption_unit',unit,'consumption_per_purchase','1','purchase_increment','0.000001');
 end if;
 waste=coalesce(p_input->>'waste_percentage',recipe.waste_percentage,v.default_waste,'0');
 measurements=coalesce(p_input->'measurements',s.snapshot->'measurements','{}');
 if p_input ? 'measurements' and measurements is distinct from s.snapshot->'measurements' and length(trim(coalesce(p_input->>'measurement_note','')))<3 then raise exception 'Changed measurements require a source note' using errcode='22023';end if;
 if p_input->>'override_quantity' is not null then
 perform private.execution_require(p_organization_id,'estimate.override_quantity');
 if length(trim(coalesce(p_input->>'override_reason','')))<3 then raise exception 'Quantity override reason required' using errcode='22023';end if;end if;
 calculation=private.execution_quantity(rule,measurements,conversion_snapshot,waste,p_input->>'override_quantity')||jsonb_build_object('scope_snapshot',s.snapshot,'recipe',case when recipe.id is not null then to_jsonb(recipe) end,'material',case when m.id is not null then jsonb_build_object('id',m.id,'name',m.name,'brand',m.brand,'variant_id',v.id,'variant_name',v.name,'attributes',v.attributes) end,'waste_source',case when p_input->>'waste_percentage' is not null then 'line' when recipe.waste_percentage is not null then 'recipe' else 'material_default' end);
 -- Rate inputs are explicitly authorized; quantity editors cannot inject or retrieve costs.
 if p_input ? 'cost_revision_id' or p_input ? 'manual_cost' or p_input ? 'cost_date' then perform private.execution_require(p_organization_id,'estimate.view_cost');end if;
 cost_date=coalesce((p_input->>'cost_date')::date,current_date);
 if not isfinite(cost_date) then raise exception 'Finite cost date required' using errcode='22023';end if;
 if kind='material' then
 select * into rate from public.material_cost_revisions cr where cr.organization_id=p_organization_id and cr.variant_id=v.id and cr.currency=c.currency and cr.valid_from<=cost_date and (cr.valid_until is null or cost_date<cr.valid_until) and
 (case when p_input->>'cost_revision_id' is not null then cr.id=(p_input->>'cost_revision_id')::uuid else cr.vendor_id is null end) order by cr.valid_from desc,cr.id limit 1;
 if p_input->>'cost_revision_id' is not null and rate.id is null then raise exception 'Unavailable effective material rate' using errcode='22023';end if;
 if rate.id is not null then unit_cost=private.execution_decimal(rate.unit_cost);rate_snapshot=to_jsonb(rate);end if;
 elsif recipe.id is not null then
 select * into service_rate from public.estimation_recipe_item_costs where recipe_item_id=recipe.id and currency=c.currency and effective_date<=cost_date;
 if service_rate.id is not null then unit_cost=private.execution_decimal(service_rate.unit_cost);rate_snapshot=to_jsonb(service_rate);end if;
 end if;
 if p_input ? 'manual_cost' then
 if jsonb_typeof(p_input->'manual_cost') is distinct from 'object' or (p_input->'manual_cost')-array['unit_cost','source_reference','reason']<>'{}'::jsonb or length(trim(coalesce(p_input#>>'{manual_cost,reason}','')))<3 or length(trim(coalesce(p_input#>>'{manual_cost,source_reference}',''))) not between 1 and 500 then raise exception 'Manual cost requires source and reason' using errcode='22023';end if;
 unit_cost=private.execution_decimal(p_input#>>'{manual_cost,unit_cost}');rate_snapshot=p_input->'manual_cost';end if;
 if target is not null and not(p_input ? 'cost_revision_id' or p_input ? 'manual_cost' or p_input ? 'cost_date') then
 select * into previous_line from public.execution_estimate_lines where id=target;
 select * into previous_cost from public.execution_estimate_line_costs where line_id=target;
 if previous_cost.id is not null and previous_line.variant_id is not distinct from variant and previous_line.cost_kind=kind and previous_line.purchase_unit=conversion_snapshot->>'purchase_unit' and previous_line.recipe_item_id is not distinct from recipe.id then
 unit_cost=previous_cost.unit_cost::numeric;rate_snapshot=previous_cost.rate_snapshot;cost_date=coalesce((rate_snapshot->>'selected_date')::date,cost_date);
 end if;end if;
 if target is not null then delete from public.execution_estimate_line_costs where line_id=target;delete from public.execution_estimate_lines where id=target;else target=gen_random_uuid();end if;
 insert into public.execution_estimate_lines(id,organization_id,revision_id,scope_id,variant_id,category_id,cost_kind,description,accuracy,method,recipe_item_id,purchase_unit,consumption_unit,base_quantity,waste_quantity,required_quantity,calculated_purchase_quantity,rounded_purchase_quantity,override_quantity,planned_purchase_quantity,override_reason,calculation_snapshot,drawing_reference,measurement_note,site_measurement_version,notes,sort_order)
 values(target,p_organization_id,r.id,s.id,variant,category,kind,description,coalesce(p_input->>'accuracy','rough'),method,recipe.id,conversion_snapshot->>'purchase_unit',conversion_snapshot->>'consumption_unit',calculation->>'base_quantity',calculation->>'waste_quantity',calculation->>'required_quantity',calculation->>'calculated_purchase_quantity',calculation->>'rounded_purchase_quantity',calculation->>'override_quantity',calculation->>'planned_purchase_quantity',coalesce(p_input->>'override_reason',''),calculation,coalesce(p_input->>'drawing_reference',''),coalesce(p_input->>'measurement_note',''),coalesce(p_input->>'site_measurement_version',''),coalesce(p_input->>'notes',''),coalesce((p_input->>'sort_order')::integer,0));
 if unit_cost is not null then
 cost=round(private.execution_decimal(calculation->>'planned_purchase_quantity')*unit_cost,c.precision);
 waste_cost=round(private.execution_decimal(calculation->>'waste_quantity')/private.execution_decimal(conversion_snapshot->>'consumption_per_purchase')*unit_cost,c.precision);
 insert into public.execution_estimate_line_costs(organization_id,line_id,revision_id,currency,unit_cost,estimated_cost,waste_cost,rate_snapshot) values(p_organization_id,target,r.id,c.currency,trim_scale(unit_cost)::text,trim_scale(cost)::text,trim_scale(waste_cost)::text,rate_snapshot||jsonb_build_object('selected_date',cost_date));end if;
 update public.execution_estimate_scope_items set coverage='estimated',exclusion_reason='',selected_recipe_id=coalesce(recipe.recipe_id,selected_recipe_id),recipe_reason=coalesce(p_input->>'recipe_reason',recipe_reason) where id=s.id;
 update public.execution_estimate_revisions set version=version+1 where id=r.id;
 perform private.crm_audit(p_organization_id,'estimate.line_saved','execution_estimate_revisions',r.id);return target;
end$$;
create or replace function public.execution_search(p_organization_id uuid,p_entity text,p_filter jsonb default '{}',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare permission text;rows jsonb;total bigint;begin
 permission=private.execution_read_permission(p_entity);
 if permission is null or not private.execution_access(p_organization_id,permission) then raise exception 'Unavailable execution records' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 or jsonb_typeof(p_filter) is distinct from 'object' or octet_length(p_filter::text)>2000 or p_filter-array['item_id','line_id','category_id','estimate_id','receipt_id','project_id','contract_id','revision_id','scope_id','material_id','variant_id','vendor_id','recipe_id','requisition_id','rfq_id','quote_id','po_id','status','query']<>'{}'::jsonb then raise exception 'Invalid execution search' using errcode='22023';end if;
 execute format('select count(*) from public.%I t where t.organization_id=$1 and not exists(select 1 from jsonb_each_text($2-''query'') f where to_jsonb(t)->>f.key is distinct from f.value) and ($2->>''query'' is null or concat_ws('' '',to_jsonb(t)->>''name'',to_jsonb(t)->>''code'',to_jsonb(t)->>''description'',to_jsonb(t)->>''estimate_number'',to_jsonb(t)->>''requisition_number'',to_jsonb(t)->>''rfq_number'',to_jsonb(t)->>''po_number'',to_jsonb(t)->>''receipt_number'',to_jsonb(t)->>''reference'') ilike ''%%''||replace(replace(replace($2->>''query'',''\'',''\\''),''%%'',''\%%''),''_'',''\_'')||''%%'')',p_entity) into total using p_organization_id,p_filter;
 execute format('select coalesce(jsonb_agg(row),''[]'') from (select to_jsonb(t) row from public.%I t where t.organization_id=$1 and not exists(select 1 from jsonb_each_text($2-''query'') f where to_jsonb(t)->>f.key is distinct from f.value) and ($2->>''query'' is null or concat_ws('' '',to_jsonb(t)->>''name'',to_jsonb(t)->>''code'',to_jsonb(t)->>''description'',to_jsonb(t)->>''estimate_number'',to_jsonb(t)->>''requisition_number'',to_jsonb(t)->>''rfq_number'',to_jsonb(t)->>''po_number'',to_jsonb(t)->>''receipt_number'',to_jsonb(t)->>''reference'') ilike ''%%''||replace(replace(replace($2->>''query'',''\'',''\\''),''%%'',''\%%''),''_'',''\_'')||''%%'') order by t.created_at desc,t.id limit 25 offset $3)x',p_entity) into rows using p_organization_id,p_filter,(p_page-1)*25;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end$$;
commit;
