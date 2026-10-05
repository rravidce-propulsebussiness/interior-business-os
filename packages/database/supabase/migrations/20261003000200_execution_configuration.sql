begin;
-- Optional quantities are genuinely optional; a NULL is not a malformed decimal.
alter table public.estimation_recipe_items drop constraint estimation_recipe_items_waste_percentage_check;
alter table public.estimation_recipe_items add check(waste_percentage is null or private.execution_decimal(waste_percentage)<=100);
alter table public.execution_estimate_lines drop constraint execution_estimate_lines_override_quantity_check;
alter table public.execution_estimate_lines add check(override_quantity is null or private.execution_decimal(override_quantity)>0);
alter table public.estimation_recipe_items add column active boolean not null default true;
create function private.execution_validate_recipe(value jsonb) returns void language plpgsql immutable set search_path='' as $$declare k text;v jsonb;begin
 if jsonb_typeof(value) is distinct from 'object' or value-array['item_key','answers']<>'{}'::jsonb or length(coalesce(value->>'item_key',''))>100 or (value ? 'answers' and (jsonb_typeof(value->'answers')<>'object' or octet_length((value->'answers')::text)>2000)) then raise exception 'Invalid recipe matching configuration' using errcode='22023';end if;
 for k,v in select * from jsonb_each(coalesce(value->'answers','{}')) loop if length(k)>100 or jsonb_typeof(v) not in ('string','array','boolean') then raise exception 'Unsupported recipe condition' using errcode='22023';end if;end loop;
end$$;
create function public.execution_configure(p_organization_id uuid,p_entity text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;prior jsonb;allowed text[];permission text;cols text;assignments text;k text;body jsonb;rule jsonb;parent uuid;begin
 permission=case when p_entity in ('material_categories','materials','material_variants','material_unit_conversions') then 'material.manage' when p_entity in ('vendors','vendor_contacts','vendor_materials') then 'vendor.manage' when p_entity in ('estimation_recipes','estimation_recipe_items','estimation_recipe_item_costs') then 'estimate.manage_recipes' end;
 if permission is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 then raise exception 'Invalid execution configuration' using errcode='22023';end if;
 perform private.execution_require(p_organization_id,permission);
 if p_entity='estimation_recipe_item_costs' then perform private.execution_require(p_organization_id,'estimate.view_cost');end if;
 target=coalesce((p_input->>'id')::uuid,gen_random_uuid());
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 for update',p_entity) into prior using p_organization_id,target;
 if p_input ? 'id' and prior is null then raise exception 'Unavailable configuration' using errcode='42501';end if;
 if prior is not null and (not(prior ? 'version') or (prior->>'version')::integer is distinct from (p_input->>'version')::integer) then raise exception 'Immutable or stale configuration' using errcode='40001';end if;
 allowed=case p_entity
 when 'material_categories' then array['name','code','status']
 when 'materials' then array['category_id','name','code','brand','manufacturer','description','preferred_vendor_id','status']
 when 'material_variants' then array['material_id','name','code','attributes','default_waste','status']
 when 'material_unit_conversions' then array['variant_id','purchase_unit','consumption_unit','consumption_per_purchase','purchase_increment','reason']
 when 'vendors' then array['name','code','legal_name','phone','email','billing_address','delivery_address','tax_identifier','payment_terms','categories_supplied','notes','status']
 when 'vendor_contacts' then array['vendor_id','name','role','phone','email','status']
 when 'vendor_materials' then array['vendor_id','variant_id','vendor_description','lead_time_days','minimum_order','pack_quantity','preferred','status']
 when 'estimation_recipes' then array['name','description','matching','override_reason_required','status']
 when 'estimation_recipe_items' then array['recipe_id','variant_id','category_id','cost_kind','description','unit','rule','waste_percentage','sort_order','active']
 else array['recipe_item_id','currency','unit_cost','source_reference','effective_date'] end;
 for k in select jsonb_object_keys(p_input) loop if k not in ('id','version') and not k=any(allowed) then raise exception 'Invalid configuration field' using errcode='22023';end if;end loop;
 body=p_input-'id'-'version';
 if p_entity='estimation_recipes' then perform private.execution_validate_recipe(coalesce(body->'matching',prior->'matching','{}'));end if;
 if p_entity='estimation_recipe_items' then
 rule=coalesce(body->'rule',prior->'rule');
 perform private.execution_quantity(rule,'{"quantity":"1","finished_area":"1","width":"1","height":"1","length":"1","depth":"1","volume":"1","percentage":"1"}','{"consumption_per_purchase":"1","purchase_increment":"0.000001"}','0');
 if prior is null and (select count(*) from public.estimation_recipe_items where organization_id=p_organization_id and recipe_id=(body->>'recipe_id')::uuid)>=100 then raise exception 'Recipe line limit exceeded' using errcode='22023';end if;
 end if;
 if p_entity='materials' and body->>'preferred_vendor_id' is not null then
 if not private.execution_access(p_organization_id,'vendor.view') or not exists(select 1 from public.vendors where organization_id=p_organization_id and id=(body->>'preferred_vendor_id')::uuid and status='active') then raise exception 'Unavailable preferred vendor' using errcode='42501';end if;end if;
 if p_entity='material_unit_conversions' then
 select id into parent from public.material_variants where organization_id=p_organization_id and id=(body->>'variant_id')::uuid and status='active' for update;
 if parent is null then raise exception 'Unavailable variant' using errcode='42501';end if;
 end if;
 select string_agg(format('%I',key),',' order by key),string_agg(format('%I=r.%I',key,key),',' order by key) into cols,assignments from jsonb_object_keys(body) key;
 if cols is null then raise exception 'Empty configuration' using errcode='22023';end if;
 if prior is null then execute format('insert into public.%1$I(id,organization_id,%2$s) select $1,$2,%2$s from jsonb_populate_record(null::public.%1$I,$3)',p_entity,cols) using target,p_organization_id,body;
 else execute format('update public.%1$I t set %2$s,version=t.version+1 from jsonb_populate_record(null::public.%1$I,$3) r where t.id=$1 and t.organization_id=$2',p_entity,assignments) using target,p_organization_id,body;end if;
 if p_entity='material_unit_conversions' then update public.material_variants set active_conversion_id=target,version=version+1 where id=parent;end if;
 perform private.crm_audit(p_organization_id,case when p_entity like 'vendor%' then 'vendor.' when p_entity like 'estimation_recipe%' then 'recipe.' else 'material.' end||case when prior is null then 'created' else 'updated' end,p_entity,target);
 return target;
end$$;
create function public.execution_cost_record(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.material_cost_revisions;target uuid;variant uuid;vendor uuid;rate_currency text;starts date;ends date;amount numeric;begin
 perform private.execution_require(p_organization_id,'material_cost.manage');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>10000 or p_input-array['variant_id','vendor_id','currency','unit_cost','source_reference','valid_from','valid_until','replaces_id','version']<>'{}'::jsonb then raise exception 'Invalid cost revision' using errcode='22023';end if;
 variant=(p_input->>'variant_id')::uuid;vendor=(p_input->>'vendor_id')::uuid;rate_currency=p_input->>'currency';starts=(p_input->>'valid_from')::date;ends=(p_input->>'valid_until')::date;amount=private.execution_decimal(p_input->>'unit_cost');
 if not exists(select 1 from public.material_variants v join public.materials m on m.id=v.material_id where v.organization_id=p_organization_id and v.id=variant and v.status='active' and m.status='active') then raise exception 'Unavailable material variant' using errcode='42501';end if;
 if vendor is not null and (not private.execution_access(p_organization_id,'vendor.view') or not exists(select 1 from public.vendor_materials vm join public.vendors v on v.id=vm.vendor_id where vm.organization_id=p_organization_id and vm.variant_id=variant and vm.vendor_id=vendor and vm.status='active' and v.status='active')) then raise exception 'Unavailable vendor material mapping' using errcode='42501';end if;
 if p_input->>'replaces_id' is not null then
 select * into prior from public.material_cost_revisions where organization_id=p_organization_id and id=(p_input->>'replaces_id')::uuid for update;
 if prior.id is null then raise exception 'Unavailable previous rate' using errcode='42501';end if;
 if prior.version is distinct from (p_input->>'version')::integer or prior.variant_id<>variant or prior.vendor_id is distinct from vendor or prior.currency<>rate_currency or prior.valid_until is not null or starts<=prior.valid_from then raise exception 'Stale or incompatible rate replacement' using errcode='40001';end if;
 update public.material_cost_revisions set valid_until=starts,version=version+1 where id=prior.id;
 end if;
 if starts is null or not isfinite(starts) or ends is not null and (not isfinite(ends) or ends<=starts) or exists(select 1 from public.material_cost_revisions r where r.organization_id=p_organization_id and r.variant_id=variant and r.vendor_id is not distinct from vendor and r.currency=rate_currency and r.valid_from<coalesce(ends,'infinity'::date) and coalesce(r.valid_until,'infinity'::date)>starts) then raise exception 'Overlapping or invalid cost window' using errcode='22023';end if;
 insert into public.material_cost_revisions(organization_id,variant_id,vendor_id,currency,unit_cost,source_reference,valid_from,valid_until) values(p_organization_id,variant,vendor,rate_currency,trim_scale(amount)::text,p_input->>'source_reference',starts,ends) returning id into target;
 perform private.crm_audit(p_organization_id,'material.cost_changed','material_cost_revisions',target);return target;
end$$;
revoke all on function private.execution_validate_recipe(jsonb) from public,anon,authenticated;
revoke all on function public.execution_configure(uuid,text,jsonb),public.execution_cost_record(uuid,jsonb) from public,anon;
grant execute on function public.execution_configure(uuid,text,jsonb),public.execution_cost_record(uuid,jsonb) to authenticated;
commit;

