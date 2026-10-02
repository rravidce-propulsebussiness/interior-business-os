begin;
-- Phase 6 is additive. Commercial contracts remain owned by Phase 5.
alter table public.contracts add constraint contracts_execution_project_key unique(organization_id,id,project_id);
create function private.execution_access(org uuid,permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_permission(org,permission) and private.entitled(org,'projects') and
 (permission not like 'vendor.%' and permission not like 'vendor_quote.%' or private.entitled(org,'vendors')) and
 (permission not like 'purchase_%' and permission not like 'rfq.%' and permission not like 'vendor_quote.%' and permission not like 'goods_receipt.%' and permission<>'cost_report.view' or private.entitled(org,'purchasing'));
$$;
create function private.execution_require(org uuid,permission text) returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.organizations where id=org for update;
 if not private.execution_access(org,permission) then raise exception 'Forbidden' using errcode='42501';end if;
end$$;
create function private.execution_decimal(value text) returns numeric language sql immutable set search_path='' as $$select private.finance_decimal(value);$$;


create table public.material_categories(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 200),
 code text not null check(length(trim(code)) between 1 and 80),
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,code));
create index material_categories_tenant_page on public.material_categories(organization_id,created_at desc,id);
alter table public.material_categories enable row level security;alter table public.material_categories force row level security;
revoke all on public.material_categories from public,anon,authenticated;grant select on public.material_categories to authenticated;
create policy execution_read on public.material_categories for select to authenticated using(private.execution_access(organization_id,'material.view'));
create trigger touch_updated_at before update on public.material_categories for each row execute function private.touch_updated_at();

create table public.vendors(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 200),
 code text not null check(length(trim(code)) between 1 and 80),
 legal_name text not null default '',
 phone text not null default '' check(length(phone)<=50),
 email text not null default '' check(length(email)<=254),
 billing_address jsonb not null default '{}' check(jsonb_typeof(billing_address)='object' and octet_length(billing_address::text)<=5000),
 delivery_address jsonb not null default '{}' check(jsonb_typeof(delivery_address)='object' and octet_length(delivery_address::text)<=5000),
 tax_identifier text not null default '' check(length(tax_identifier)<=80),
 payment_terms text not null default '' check(length(payment_terms)<=3000),
 categories_supplied jsonb not null default '[]' check(jsonb_typeof(categories_supplied)='array' and jsonb_array_length(categories_supplied)<=50),
 notes text not null default '' check(length(notes)<=3000),
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,code));
create index vendors_tenant_page on public.vendors(organization_id,created_at desc,id);
alter table public.vendors enable row level security;alter table public.vendors force row level security;
revoke all on public.vendors from public,anon,authenticated;grant select on public.vendors to authenticated;
create policy execution_read on public.vendors for select to authenticated using(private.execution_access(organization_id,'vendor.view'));
create trigger touch_updated_at before update on public.vendors for each row execute function private.touch_updated_at();

create table public.vendor_contacts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 vendor_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 200),
 role text not null default '',
 phone text not null default '',
 email text not null default '',
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,vendor_id) references public.vendors(organization_id,id));
create index vendor_contacts_tenant_page on public.vendor_contacts(organization_id,created_at desc,id);
alter table public.vendor_contacts enable row level security;alter table public.vendor_contacts force row level security;
revoke all on public.vendor_contacts from public,anon,authenticated;grant select on public.vendor_contacts to authenticated;
create policy execution_read on public.vendor_contacts for select to authenticated using(private.execution_access(organization_id,'vendor.view'));
create trigger touch_updated_at before update on public.vendor_contacts for each row execute function private.touch_updated_at();

create table public.materials(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 category_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 200),
 code text not null check(length(trim(code)) between 1 and 80),
 brand text not null default '' check(length(brand)<=100),
 manufacturer text not null default '' check(length(manufacturer)<=200),
 description text not null default '' check(length(description)<=3000),
 preferred_vendor_id uuid,
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,category_id) references public.material_categories(organization_id,id),
 foreign key(organization_id,preferred_vendor_id) references public.vendors(organization_id,id),
 unique(organization_id,code));
create index materials_tenant_page on public.materials(organization_id,created_at desc,id);
alter table public.materials enable row level security;alter table public.materials force row level security;
revoke all on public.materials from public,anon,authenticated;grant select on public.materials to authenticated;
create policy execution_read on public.materials for select to authenticated using(private.execution_access(organization_id,'material.view'));
create trigger touch_updated_at before update on public.materials for each row execute function private.touch_updated_at();

create table public.material_variants(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 material_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 200),
 code text not null check(length(trim(code)) between 1 and 80),
 attributes jsonb not null default '{}' check(jsonb_typeof(attributes)='object' and octet_length(attributes::text)<=8000),
 default_waste text not null default '0' check(private.execution_decimal(default_waste)<=100),
 active_conversion_id uuid,
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,material_id) references public.materials(organization_id,id),
 unique(organization_id,code));
create index material_variants_tenant_page on public.material_variants(organization_id,created_at desc,id);
alter table public.material_variants enable row level security;alter table public.material_variants force row level security;
revoke all on public.material_variants from public,anon,authenticated;grant select on public.material_variants to authenticated;
create policy execution_read on public.material_variants for select to authenticated using(private.execution_access(organization_id,'material.view'));
create trigger touch_updated_at before update on public.material_variants for each row execute function private.touch_updated_at();

create table public.material_unit_conversions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 variant_id uuid not null,
 purchase_unit text not null check(length(trim(purchase_unit)) between 1 and 40),
 consumption_unit text not null check(length(trim(consumption_unit)) between 1 and 40),
 consumption_per_purchase text not null check(private.execution_decimal(consumption_per_purchase)>0),
 purchase_increment text not null check(private.execution_decimal(purchase_increment)>0),
 reason text not null check(length(trim(reason)) between 3 and 3000),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,variant_id) references public.material_variants(organization_id,id),
 unique(organization_id,variant_id,id));
create index material_unit_conversions_tenant_page on public.material_unit_conversions(organization_id,created_at desc,id);
alter table public.material_unit_conversions enable row level security;alter table public.material_unit_conversions force row level security;
revoke all on public.material_unit_conversions from public,anon,authenticated;grant select on public.material_unit_conversions to authenticated;
create policy execution_read on public.material_unit_conversions for select to authenticated using(private.execution_access(organization_id,'material.view'));
create trigger touch_updated_at before update on public.material_unit_conversions for each row execute function private.touch_updated_at();

alter table public.material_variants add foreign key(organization_id,id,active_conversion_id) references public.material_unit_conversions(organization_id,variant_id,id);

create table public.vendor_materials(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 vendor_id uuid not null,
 variant_id uuid not null,
 vendor_description text not null default '' check(length(vendor_description)<=500),
 lead_time_days integer not null default 0 check(lead_time_days between 0 and 3650),
 minimum_order text not null check(private.execution_decimal(minimum_order)>=0),
 pack_quantity text not null check(private.execution_decimal(pack_quantity)>0),
 preferred boolean not null default false,
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,vendor_id) references public.vendors(organization_id,id),
 foreign key(organization_id,variant_id) references public.material_variants(organization_id,id),
 unique(organization_id,vendor_id,variant_id));
create index vendor_materials_tenant_page on public.vendor_materials(organization_id,created_at desc,id);
alter table public.vendor_materials enable row level security;alter table public.vendor_materials force row level security;
revoke all on public.vendor_materials from public,anon,authenticated;grant select on public.vendor_materials to authenticated;
create policy execution_read on public.vendor_materials for select to authenticated using(private.execution_access(organization_id,'vendor.view'));
create trigger touch_updated_at before update on public.vendor_materials for each row execute function private.touch_updated_at();

create table public.material_cost_revisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 variant_id uuid not null,
 vendor_id uuid,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 unit_cost text not null check(private.execution_decimal(unit_cost)>=0),
 source_reference text not null check(length(trim(source_reference)) between 1 and 500),
 valid_from date not null check(isfinite(valid_from)),
 valid_until date check(isfinite(valid_until) and valid_until>valid_from),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,variant_id) references public.material_variants(organization_id,id),
 foreign key(organization_id,vendor_id) references public.vendors(organization_id,id));
create index material_cost_revisions_tenant_page on public.material_cost_revisions(organization_id,created_at desc,id);
alter table public.material_cost_revisions enable row level security;alter table public.material_cost_revisions force row level security;
revoke all on public.material_cost_revisions from public,anon,authenticated;grant select on public.material_cost_revisions to authenticated;
create policy execution_read on public.material_cost_revisions for select to authenticated using(private.execution_access(organization_id,'material_cost.view'));
create trigger touch_updated_at before update on public.material_cost_revisions for each row execute function private.touch_updated_at();

create table public.estimation_recipes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 200),
 description text not null default '' check(length(description)<=3000),
 matching jsonb not null default '{}' check(jsonb_typeof(matching)='object' and octet_length(matching::text)<=4000),
 override_reason_required boolean not null default true,
 status text not null default 'active' check(status in ('active','inactive')),
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id));
create index estimation_recipes_tenant_page on public.estimation_recipes(organization_id,created_at desc,id);
alter table public.estimation_recipes enable row level security;alter table public.estimation_recipes force row level security;
revoke all on public.estimation_recipes from public,anon,authenticated;grant select on public.estimation_recipes to authenticated;
create policy execution_read on public.estimation_recipes for select to authenticated using(private.execution_access(organization_id,'estimate.view'));
create trigger touch_updated_at before update on public.estimation_recipes for each row execute function private.touch_updated_at();

create table public.estimation_recipe_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 recipe_id uuid not null,
 variant_id uuid,
 category_id uuid,
 cost_kind text not null check(cost_kind in ('material','labour','external_service','transport','other')),
 description text not null default '' check(length(description)<=3000),
 unit text not null default 'each' check(length(unit) between 1 and 40),
 rule jsonb not null check(jsonb_typeof(rule)='object' and octet_length(rule::text)<=2000),
 waste_percentage text check(private.execution_decimal(waste_percentage)<=100),
 sort_order integer not null check(sort_order>=0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,recipe_id) references public.estimation_recipes(organization_id,id),
 foreign key(organization_id,variant_id) references public.material_variants(organization_id,id),
 foreign key(organization_id,category_id) references public.material_categories(organization_id,id),
 unique(recipe_id,sort_order),
 check((cost_kind='material')=(variant_id is not null)));
create index estimation_recipe_items_tenant_page on public.estimation_recipe_items(organization_id,created_at desc,id);
alter table public.estimation_recipe_items enable row level security;alter table public.estimation_recipe_items force row level security;
revoke all on public.estimation_recipe_items from public,anon,authenticated;grant select on public.estimation_recipe_items to authenticated;
create policy execution_read on public.estimation_recipe_items for select to authenticated using(private.execution_access(organization_id,'estimate.view'));
create trigger touch_updated_at before update on public.estimation_recipe_items for each row execute function private.touch_updated_at();

create table public.estimation_recipe_item_costs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 recipe_item_id uuid not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 unit_cost text not null check(private.execution_decimal(unit_cost)>=0),
 source_reference text not null check(length(trim(source_reference)) between 1 and 500),
 effective_date date not null check(isfinite(effective_date)),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,recipe_item_id) references public.estimation_recipe_items(organization_id,id),
 unique(recipe_item_id));
create index estimation_recipe_item_costs_tenant_page on public.estimation_recipe_item_costs(organization_id,created_at desc,id);
alter table public.estimation_recipe_item_costs enable row level security;alter table public.estimation_recipe_item_costs force row level security;
revoke all on public.estimation_recipe_item_costs from public,anon,authenticated;grant select on public.estimation_recipe_item_costs to authenticated;
create policy execution_read on public.estimation_recipe_item_costs for select to authenticated using(private.execution_access(organization_id,'estimate.view_cost'));
create trigger touch_updated_at before update on public.estimation_recipe_item_costs for each row execute function private.touch_updated_at();

create table public.execution_estimates(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 contract_id uuid not null,
 project_id uuid not null,
 estimate_number text not null,
 next_revision integer not null default 2 check(next_revision>=2),
 current_approved_revision_id uuid,
 version integer not null default 1 check(version>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,project_id) references public.contracts(organization_id,id,project_id),
 unique(organization_id,contract_id),
 unique(organization_id,estimate_number),
 unique(organization_id,contract_id,id));
create index execution_estimates_tenant_page on public.execution_estimates(organization_id,created_at desc,id);
alter table public.execution_estimates enable row level security;alter table public.execution_estimates force row level security;
revoke all on public.execution_estimates from public,anon,authenticated;grant select on public.execution_estimates to authenticated;
create policy execution_read on public.execution_estimates for select to authenticated using(private.execution_access(organization_id,'estimate.view'));
create trigger touch_updated_at before update on public.execution_estimates for each row execute function private.touch_updated_at();

create table public.execution_estimate_revisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 estimate_id uuid not null,
 contract_id uuid not null,
 project_id uuid not null,
 revision_number integer not null check(revision_number>0),
 status text not null default 'draft' check(status in ('draft','under_review','approved','superseded','cancelled')),
 scope_fingerprint text not null,
 notes text not null default '' check(length(notes)<=3000),
 version integer not null default 1 check(version>0),
 reviewed_by uuid references public.profiles(id),
 approved_by uuid references public.profiles(id),
 submitted_at timestamptz,
 approved_at timestamptz,
 decision_reason text not null default '',
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,estimate_id) references public.execution_estimates(organization_id,contract_id,id),
 foreign key(organization_id,contract_id,project_id) references public.contracts(organization_id,id,project_id),
 unique(estimate_id,revision_number),
 unique(organization_id,contract_id,id));
create index execution_estimate_revisions_tenant_page on public.execution_estimate_revisions(organization_id,created_at desc,id);
alter table public.execution_estimate_revisions enable row level security;alter table public.execution_estimate_revisions force row level security;
revoke all on public.execution_estimate_revisions from public,anon,authenticated;grant select on public.execution_estimate_revisions to authenticated;
create policy execution_read on public.execution_estimate_revisions for select to authenticated using(private.execution_access(organization_id,'estimate.view'));
create trigger touch_updated_at before update on public.execution_estimate_revisions for each row execute function private.touch_updated_at();

alter table public.execution_estimates add foreign key(organization_id,contract_id,current_approved_revision_id) references public.execution_estimate_revisions(organization_id,contract_id,id);
create unique index execution_one_draft on public.execution_estimate_revisions(estimate_id) where status in ('draft','under_review');
create unique index execution_one_approved on public.execution_estimate_revisions(estimate_id) where status='approved';

create table public.execution_estimate_scope_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 revision_id uuid not null,
 contract_id uuid not null,
 source_type text not null check(source_type in ('quotation','change_order')),
 source_id uuid not null,
 area_id uuid,
 area_name text not null default '',
 snapshot jsonb not null check(octet_length(snapshot::text)<=50000),
 coverage text not null default 'unestimated' check(coverage in ('unestimated','estimated','excluded','removed')),
 exclusion_reason text not null default '' check(length(exclusion_reason)<=3000),
 suggested_recipe_id uuid,
 selected_recipe_id uuid,
 recipe_reason text not null default '',
 sort_order integer not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,revision_id) references public.execution_estimate_revisions(organization_id,contract_id,id),
 foreign key(organization_id,area_id) references public.project_areas(organization_id,id),
 foreign key(organization_id,suggested_recipe_id) references public.estimation_recipes(organization_id,id),
 foreign key(organization_id,selected_recipe_id) references public.estimation_recipes(organization_id,id),
 unique(revision_id,source_type,source_id),
 unique(organization_id,revision_id,id));
create index execution_estimate_scope_items_tenant_page on public.execution_estimate_scope_items(organization_id,created_at desc,id);
alter table public.execution_estimate_scope_items enable row level security;alter table public.execution_estimate_scope_items force row level security;
revoke all on public.execution_estimate_scope_items from public,anon,authenticated;grant select on public.execution_estimate_scope_items to authenticated;
create policy execution_read on public.execution_estimate_scope_items for select to authenticated using(private.execution_access(organization_id,'estimate.view'));
create trigger touch_updated_at before update on public.execution_estimate_scope_items for each row execute function private.touch_updated_at();

create table public.execution_estimate_lines(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 revision_id uuid not null,
 scope_id uuid not null,
 variant_id uuid,
 category_id uuid,
 cost_kind text not null check(cost_kind in ('material','labour','external_service','transport','other')),
 description text not null default '' check(length(description)<=3000),
 accuracy text not null default 'rough' check(accuracy in ('rough','detailed','final_estimate')),
 method text not null check(method in ('manual','rule','recipe')),
 recipe_item_id uuid,
 purchase_unit text not null,
 consumption_unit text not null,
 base_quantity text not null check(private.execution_decimal(base_quantity)>=0),
 waste_quantity text not null check(private.execution_decimal(waste_quantity)>=0),
 required_quantity text not null check(private.execution_decimal(required_quantity)>=0),
 calculated_purchase_quantity text not null check(private.execution_decimal(calculated_purchase_quantity)>=0),
 rounded_purchase_quantity text not null check(private.execution_decimal(rounded_purchase_quantity)>=0),
 override_quantity text check(private.execution_decimal(override_quantity)>0),
 planned_purchase_quantity text not null check(private.execution_decimal(planned_purchase_quantity)>0),
 override_reason text not null default '',
 calculation_snapshot jsonb not null check(octet_length(calculation_snapshot::text)<=50000),
 drawing_reference text not null default '' check(length(drawing_reference)<=500),
 measurement_note text not null default '' check(length(measurement_note)<=3000),
 site_measurement_version text not null default '' check(length(site_measurement_version)<=100),
 notes text not null default '' check(length(notes)<=3000),
 sort_order integer not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,revision_id,scope_id) references public.execution_estimate_scope_items(organization_id,revision_id,id),
 foreign key(organization_id,variant_id) references public.material_variants(organization_id,id),
 foreign key(organization_id,category_id) references public.material_categories(organization_id,id),
 foreign key(organization_id,recipe_item_id) references public.estimation_recipe_items(organization_id,id),
 unique(organization_id,revision_id,id),
 check((cost_kind='material')=(variant_id is not null)));
create index execution_estimate_lines_tenant_page on public.execution_estimate_lines(organization_id,created_at desc,id);
alter table public.execution_estimate_lines enable row level security;alter table public.execution_estimate_lines force row level security;
revoke all on public.execution_estimate_lines from public,anon,authenticated;grant select on public.execution_estimate_lines to authenticated;
create policy execution_read on public.execution_estimate_lines for select to authenticated using(private.execution_access(organization_id,'estimate.view'));
create trigger touch_updated_at before update on public.execution_estimate_lines for each row execute function private.touch_updated_at();

create table public.execution_estimate_line_costs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 line_id uuid not null,
 revision_id uuid not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 unit_cost text not null check(private.execution_decimal(unit_cost)>=0),
 estimated_cost text not null check(private.execution_decimal(estimated_cost)>=0),
 waste_cost text not null check(private.execution_decimal(waste_cost)>=0),
 rate_snapshot jsonb not null check(octet_length(rate_snapshot::text)<=10000),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,revision_id,line_id) references public.execution_estimate_lines(organization_id,revision_id,id),
 unique(line_id));
create index execution_estimate_line_costs_tenant_page on public.execution_estimate_line_costs(organization_id,created_at desc,id);
alter table public.execution_estimate_line_costs enable row level security;alter table public.execution_estimate_line_costs force row level security;
revoke all on public.execution_estimate_line_costs from public,anon,authenticated;grant select on public.execution_estimate_line_costs to authenticated;
create policy execution_read on public.execution_estimate_line_costs for select to authenticated using(private.execution_access(organization_id,'estimate.view_cost'));
create trigger touch_updated_at before update on public.execution_estimate_line_costs for each row execute function private.touch_updated_at();

create table public.purchase_requisitions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 contract_id uuid not null,
 project_id uuid not null,
 estimate_revision_id uuid not null,
 requisition_number text not null,
 status text not null default 'draft' check(status in ('draft','submitted','approved','cancelled')),
 required_date date check(isfinite(required_date)),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 delivery_location text not null check(length(delivery_location) between 1 and 3000),
 notes text not null default '' check(length(notes)<=3000),
 version integer not null default 1 check(version>0),
 idempotency_key uuid not null,
 request_hash text not null,
 approved_at timestamptz,
 approved_by uuid references public.profiles(id),
 cancel_reason text not null default '',
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,project_id) references public.contracts(organization_id,id,project_id),
 foreign key(organization_id,contract_id,estimate_revision_id) references public.execution_estimate_revisions(organization_id,contract_id,id),
 unique(organization_id,requisition_number),
 unique(organization_id,idempotency_key),
 unique(organization_id,contract_id,id));
create index purchase_requisitions_tenant_page on public.purchase_requisitions(organization_id,created_at desc,id);
alter table public.purchase_requisitions enable row level security;alter table public.purchase_requisitions force row level security;
revoke all on public.purchase_requisitions from public,anon,authenticated;grant select on public.purchase_requisitions to authenticated;
create policy execution_read on public.purchase_requisitions for select to authenticated using(private.execution_access(organization_id,'purchase_requisition.view'));
create trigger touch_updated_at before update on public.purchase_requisitions for each row execute function private.touch_updated_at();

create table public.purchase_requisition_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 requisition_id uuid not null,
 variant_id uuid,
 category_id uuid,
 cost_kind text not null check(cost_kind in ('material','labour','external_service','transport','other')),
 description text not null default '' check(length(description)<=3000),
 unit text not null,
 quantity text not null check(private.execution_decimal(quantity)>0),
 snapshot jsonb not null,
 sort_order integer not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,requisition_id) references public.purchase_requisitions(organization_id,id),
 foreign key(organization_id,variant_id) references public.material_variants(organization_id,id),
 foreign key(organization_id,category_id) references public.material_categories(organization_id,id),
 unique(organization_id,requisition_id,id));
create index purchase_requisition_items_tenant_page on public.purchase_requisition_items(organization_id,created_at desc,id);
alter table public.purchase_requisition_items enable row level security;alter table public.purchase_requisition_items force row level security;
revoke all on public.purchase_requisition_items from public,anon,authenticated;grant select on public.purchase_requisition_items to authenticated;
create policy execution_read on public.purchase_requisition_items for select to authenticated using(private.execution_access(organization_id,'purchase_requisition.view'));
create trigger touch_updated_at before update on public.purchase_requisition_items for each row execute function private.touch_updated_at();

create table public.purchase_requisition_sources(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 requisition_id uuid not null,
 item_id uuid not null,
 estimate_line_id uuid not null,
 quantity text not null check(private.execution_decimal(quantity)>0),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,requisition_id,item_id) references public.purchase_requisition_items(organization_id,requisition_id,id),
 foreign key(organization_id,estimate_line_id) references public.execution_estimate_lines(organization_id,id),
 unique(item_id,estimate_line_id));
create index purchase_requisition_sources_tenant_page on public.purchase_requisition_sources(organization_id,created_at desc,id);
alter table public.purchase_requisition_sources enable row level security;alter table public.purchase_requisition_sources force row level security;
revoke all on public.purchase_requisition_sources from public,anon,authenticated;grant select on public.purchase_requisition_sources to authenticated;
create policy execution_read on public.purchase_requisition_sources for select to authenticated using(private.execution_access(organization_id,'purchase_requisition.view'));
create trigger touch_updated_at before update on public.purchase_requisition_sources for each row execute function private.touch_updated_at();

create table public.rfqs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 contract_id uuid not null,
 project_id uuid not null,
 requisition_id uuid not null,
 rfq_number text not null,
 status text not null default 'draft' check(status in ('draft','issued','closed','cancelled')),
 required_date date check(isfinite(required_date)),
 delivery_location text not null,
 notes text not null default '' check(length(notes)<=3000),
 version integer not null default 1 check(version>0),
 idempotency_key uuid not null,
 request_hash text not null,
 issued_at timestamptz,
 document_snapshot jsonb,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,project_id) references public.contracts(organization_id,id,project_id),
 foreign key(organization_id,contract_id,requisition_id) references public.purchase_requisitions(organization_id,contract_id,id),
 unique(organization_id,rfq_number),
 unique(organization_id,idempotency_key),
 unique(organization_id,contract_id,id));
create index rfqs_tenant_page on public.rfqs(organization_id,created_at desc,id);
alter table public.rfqs enable row level security;alter table public.rfqs force row level security;
revoke all on public.rfqs from public,anon,authenticated;grant select on public.rfqs to authenticated;
create policy execution_read on public.rfqs for select to authenticated using(private.execution_access(organization_id,'rfq.view'));
create trigger touch_updated_at before update on public.rfqs for each row execute function private.touch_updated_at();

create table public.rfq_vendors(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 rfq_id uuid not null,
 vendor_id uuid not null,
 response_status text not null default 'pending' check(response_status in ('pending','received','declined')),
 vendor_snapshot jsonb not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,rfq_id) references public.rfqs(organization_id,id),
 foreign key(organization_id,vendor_id) references public.vendors(organization_id,id),
 unique(organization_id,rfq_id,vendor_id));
create index rfq_vendors_tenant_page on public.rfq_vendors(organization_id,created_at desc,id);
alter table public.rfq_vendors enable row level security;alter table public.rfq_vendors force row level security;
revoke all on public.rfq_vendors from public,anon,authenticated;grant select on public.rfq_vendors to authenticated;
create policy execution_read on public.rfq_vendors for select to authenticated using(private.execution_access(organization_id,'rfq.view'));
create trigger touch_updated_at before update on public.rfq_vendors for each row execute function private.touch_updated_at();

create table public.rfq_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 rfq_id uuid not null,
 requisition_item_id uuid not null,
 description text not null default '' check(length(description)<=3000),
 unit text not null,
 quantity text not null check(private.execution_decimal(quantity)>0),
 snapshot jsonb not null,
 sort_order integer not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,rfq_id) references public.rfqs(organization_id,id),
 foreign key(organization_id,requisition_item_id) references public.purchase_requisition_items(organization_id,id),
 unique(rfq_id,requisition_item_id),
 unique(organization_id,rfq_id,id));
create index rfq_items_tenant_page on public.rfq_items(organization_id,created_at desc,id);
alter table public.rfq_items enable row level security;alter table public.rfq_items force row level security;
revoke all on public.rfq_items from public,anon,authenticated;grant select on public.rfq_items to authenticated;
create policy execution_read on public.rfq_items for select to authenticated using(private.execution_access(organization_id,'rfq.view'));
create trigger touch_updated_at before update on public.rfq_items for each row execute function private.touch_updated_at();

create table public.vendor_quotes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 contract_id uuid not null,
 project_id uuid not null,
 rfq_id uuid not null,
 vendor_id uuid not null,
 reference text not null check(length(trim(reference)) between 1 and 200),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 valid_until date not null check(isfinite(valid_until)),
 status text not null default 'draft' check(status in ('draft','recorded','declined','cancelled')),
 lead_time_days integer not null default 0 check(lead_time_days between 0 and 3650),
 freight text not null check(private.execution_decimal(freight)>=0),
 subtotal text not null check(private.execution_decimal(subtotal)>=0),
 tax_amount text not null check(private.execution_decimal(tax_amount)>=0),
 total text not null check(private.execution_decimal(total)>=0),
 payment_terms text not null default '' check(length(payment_terms)<=3000),
 notes text not null default '' check(length(notes)<=3000),
 version integer not null default 1 check(version>0),
 recorded_at timestamptz,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,project_id) references public.contracts(organization_id,id,project_id),
 foreign key(organization_id,contract_id,rfq_id) references public.rfqs(organization_id,contract_id,id),
 foreign key(organization_id,rfq_id,vendor_id) references public.rfq_vendors(organization_id,rfq_id,vendor_id),
 unique(organization_id,rfq_id,id));
create index vendor_quotes_tenant_page on public.vendor_quotes(organization_id,created_at desc,id);
alter table public.vendor_quotes enable row level security;alter table public.vendor_quotes force row level security;
revoke all on public.vendor_quotes from public,anon,authenticated;grant select on public.vendor_quotes to authenticated;
create policy execution_read on public.vendor_quotes for select to authenticated using(private.execution_access(organization_id,'vendor_quote.view'));
create trigger touch_updated_at before update on public.vendor_quotes for each row execute function private.touch_updated_at();

create table public.vendor_quote_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 quote_id uuid not null,
 rfq_id uuid not null,
 rfq_item_id uuid not null,
 description text not null default '' check(length(description)<=3000),
 unit text not null,
 quantity text not null check(private.execution_decimal(quantity)>0),
 unit_price text not null check(private.execution_decimal(unit_price)>=0),
 discount text not null check(private.execution_decimal(discount)>=0),
 taxable_amount text not null check(private.execution_decimal(taxable_amount)>=0),
 tax_amount text not null check(private.execution_decimal(tax_amount)>=0),
 total text not null check(private.execution_decimal(total)>=0),
 tax_mode text not null check(tax_mode in ('inclusive','exclusive')),
 tax_components jsonb not null,
 minimum_order text not null check(private.execution_decimal(minimum_order)>=0),
 lead_time_days integer not null check(lead_time_days between 0 and 3650),
 notes text not null default '' check(length(notes)<=3000),
 sort_order integer not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,rfq_id,quote_id) references public.vendor_quotes(organization_id,rfq_id,id),
 foreign key(organization_id,rfq_id,rfq_item_id) references public.rfq_items(organization_id,rfq_id,id),
 unique(quote_id,rfq_item_id),
 unique(organization_id,quote_id,id));
create index vendor_quote_items_tenant_page on public.vendor_quote_items(organization_id,created_at desc,id);
alter table public.vendor_quote_items enable row level security;alter table public.vendor_quote_items force row level security;
revoke all on public.vendor_quote_items from public,anon,authenticated;grant select on public.vendor_quote_items to authenticated;
create policy execution_read on public.vendor_quote_items for select to authenticated using(private.execution_access(organization_id,'vendor_quote.view'));
create trigger touch_updated_at before update on public.vendor_quote_items for each row execute function private.touch_updated_at();

create table public.purchase_orders(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 contract_id uuid not null,
 project_id uuid not null,
 vendor_id uuid not null,
 quote_id uuid not null,
 requisition_id uuid not null,
 po_number text not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 status text not null default 'draft' check(status in ('draft','issued','partially_received','received','cancelled','closed')),
 order_date date not null check(isfinite(order_date)),
 delivery_date date check(isfinite(delivery_date)),
 delivery_location text not null,
 notes text not null default '' check(length(notes)<=3000),
 version integer not null default 1 check(version>0),
 idempotency_key uuid not null,
 request_hash text not null,
 issued_at timestamptz,
 issued_by uuid references public.profiles(id),
 decision_reason text not null default '',
 closed_at timestamptz,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,project_id) references public.contracts(organization_id,id,project_id),
 foreign key(organization_id,vendor_id) references public.vendors(organization_id,id),
 foreign key(organization_id,quote_id) references public.vendor_quotes(organization_id,id),
 foreign key(organization_id,contract_id,requisition_id) references public.purchase_requisitions(organization_id,contract_id,id),
 unique(organization_id,po_number),
 unique(organization_id,idempotency_key),
 unique(organization_id,contract_id,id));
create index purchase_orders_tenant_page on public.purchase_orders(organization_id,created_at desc,id);
alter table public.purchase_orders enable row level security;alter table public.purchase_orders force row level security;
revoke all on public.purchase_orders from public,anon,authenticated;grant select on public.purchase_orders to authenticated;
create policy execution_read on public.purchase_orders for select to authenticated using(private.execution_access(organization_id,'purchase_order.view'));
create trigger touch_updated_at before update on public.purchase_orders for each row execute function private.touch_updated_at();

create table public.purchase_order_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 po_id uuid not null,
 quote_item_id uuid not null,
 requisition_item_id uuid not null,
 variant_id uuid,
 cost_kind text not null check(cost_kind in ('material','labour','external_service','transport','other')),
 description text not null default '' check(length(description)<=3000),
 unit text not null,
 quantity text not null check(private.execution_decimal(quantity)>0),
 scope_snapshot jsonb not null,
 sort_order integer not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,po_id) references public.purchase_orders(organization_id,id),
 foreign key(organization_id,quote_item_id) references public.vendor_quote_items(organization_id,id),
 foreign key(organization_id,requisition_item_id) references public.purchase_requisition_items(organization_id,id),
 foreign key(organization_id,variant_id) references public.material_variants(organization_id,id),
 unique(po_id,quote_item_id),
 unique(organization_id,po_id,id));
create index purchase_order_items_tenant_page on public.purchase_order_items(organization_id,created_at desc,id);
alter table public.purchase_order_items enable row level security;alter table public.purchase_order_items force row level security;
revoke all on public.purchase_order_items from public,anon,authenticated;grant select on public.purchase_order_items to authenticated;
create policy execution_read on public.purchase_order_items for select to authenticated using(private.execution_access(organization_id,'purchase_order.view'));
create trigger touch_updated_at before update on public.purchase_order_items for each row execute function private.touch_updated_at();

create table public.purchase_order_costs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 po_id uuid not null,
 subtotal text not null check(private.execution_decimal(subtotal)>=0),
 tax_amount text not null check(private.execution_decimal(tax_amount)>=0),
 freight text not null check(private.execution_decimal(freight)>=0),
 total text not null check(private.execution_decimal(total)>=0),
 document_snapshot jsonb not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,po_id) references public.purchase_orders(organization_id,id),
 unique(po_id));
create index purchase_order_costs_tenant_page on public.purchase_order_costs(organization_id,created_at desc,id);
alter table public.purchase_order_costs enable row level security;alter table public.purchase_order_costs force row level security;
revoke all on public.purchase_order_costs from public,anon,authenticated;grant select on public.purchase_order_costs to authenticated;
create policy execution_read on public.purchase_order_costs for select to authenticated using(private.execution_access(organization_id,'purchase_order.view_cost'));
create trigger touch_updated_at before update on public.purchase_order_costs for each row execute function private.touch_updated_at();

create table public.purchase_order_item_costs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 po_id uuid not null,
 item_id uuid not null,
 unit_price text not null check(private.execution_decimal(unit_price)>=0),
 discount text not null check(private.execution_decimal(discount)>=0),
 taxable_amount text not null check(private.execution_decimal(taxable_amount)>=0),
 tax_amount text not null check(private.execution_decimal(tax_amount)>=0),
 freight text not null check(private.execution_decimal(freight)>=0),
 total text not null check(private.execution_decimal(total)>=0),
 snapshot jsonb not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,po_id,item_id) references public.purchase_order_items(organization_id,po_id,id),
 unique(item_id));
create index purchase_order_item_costs_tenant_page on public.purchase_order_item_costs(organization_id,created_at desc,id);
alter table public.purchase_order_item_costs enable row level security;alter table public.purchase_order_item_costs force row level security;
revoke all on public.purchase_order_item_costs from public,anon,authenticated;grant select on public.purchase_order_item_costs to authenticated;
create policy execution_read on public.purchase_order_item_costs for select to authenticated using(private.execution_access(organization_id,'purchase_order.view_cost'));
create trigger touch_updated_at before update on public.purchase_order_item_costs for each row execute function private.touch_updated_at();

create table public.goods_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 contract_id uuid not null,
 project_id uuid not null,
 po_id uuid not null,
 receipt_number text not null,
 receipt_date date not null check(isfinite(receipt_date)),
 supplier_reference text not null default '' check(length(supplier_reference)<=200),
 notes text not null default '' check(length(notes)<=3000),
 idempotency_key uuid not null,
 request_hash text not null,
 document_snapshot jsonb not null,
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,contract_id,project_id) references public.contracts(organization_id,id,project_id),
 foreign key(organization_id,contract_id,po_id) references public.purchase_orders(organization_id,contract_id,id),
 unique(organization_id,receipt_number),
 unique(organization_id,idempotency_key),
 unique(organization_id,po_id,id));
create index goods_receipts_tenant_page on public.goods_receipts(organization_id,created_at desc,id);
alter table public.goods_receipts enable row level security;alter table public.goods_receipts force row level security;
revoke all on public.goods_receipts from public,anon,authenticated;grant select on public.goods_receipts to authenticated;
create policy execution_read on public.goods_receipts for select to authenticated using(private.execution_access(organization_id,'goods_receipt.view'));
create trigger touch_updated_at before update on public.goods_receipts for each row execute function private.touch_updated_at();

create table public.goods_receipt_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 receipt_id uuid not null,
 po_id uuid not null,
 po_item_id uuid not null,
 received_quantity text not null check(private.execution_decimal(received_quantity)>0),
 accepted_quantity text not null check(private.execution_decimal(accepted_quantity)>=0),
 rejected_quantity text not null check(private.execution_decimal(rejected_quantity)>=0),
 notes text not null default '' check(length(notes)<=3000),
 created_by uuid references public.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,po_id,receipt_id) references public.goods_receipts(organization_id,po_id,id),
 foreign key(organization_id,po_id,po_item_id) references public.purchase_order_items(organization_id,po_id,id),
 unique(receipt_id,po_item_id),
 check(received_quantity::numeric=accepted_quantity::numeric+rejected_quantity::numeric));
create index goods_receipt_items_tenant_page on public.goods_receipt_items(organization_id,created_at desc,id);
alter table public.goods_receipt_items enable row level security;alter table public.goods_receipt_items force row level security;
revoke all on public.goods_receipt_items from public,anon,authenticated;grant select on public.goods_receipt_items to authenticated;
create policy execution_read on public.goods_receipt_items for select to authenticated using(private.execution_access(organization_id,'goods_receipt.view'));
create trigger touch_updated_at before update on public.goods_receipt_items for each row execute function private.touch_updated_at();

create function private.execution_read_permission(entity text) returns text language sql immutable set search_path='' as $$select case entity when 'material_categories' then 'material.view' when 'vendors' then 'vendor.view' when 'vendor_contacts' then 'vendor.view' when 'materials' then 'material.view' when 'material_variants' then 'material.view' when 'material_unit_conversions' then 'material.view' when 'vendor_materials' then 'vendor.view' when 'material_cost_revisions' then 'material_cost.view' when 'estimation_recipes' then 'estimate.view' when 'estimation_recipe_items' then 'estimate.view' when 'estimation_recipe_item_costs' then 'estimate.view_cost' when 'execution_estimates' then 'estimate.view' when 'execution_estimate_revisions' then 'estimate.view' when 'execution_estimate_scope_items' then 'estimate.view' when 'execution_estimate_lines' then 'estimate.view' when 'execution_estimate_line_costs' then 'estimate.view_cost' when 'purchase_requisitions' then 'purchase_requisition.view' when 'purchase_requisition_items' then 'purchase_requisition.view' when 'purchase_requisition_sources' then 'purchase_requisition.view' when 'rfqs' then 'rfq.view' when 'rfq_vendors' then 'rfq.view' when 'rfq_items' then 'rfq.view' when 'vendor_quotes' then 'vendor_quote.view' when 'vendor_quote_items' then 'vendor_quote.view' when 'purchase_orders' then 'purchase_order.view' when 'purchase_order_items' then 'purchase_order.view' when 'purchase_order_costs' then 'purchase_order.view_cost' when 'purchase_order_item_costs' then 'purchase_order.view_cost' when 'goods_receipts' then 'goods_receipt.view' when 'goods_receipt_items' then 'goods_receipt.view' end;$$;
create policy execution_audit_restriction on public.audit_logs as restrictive for select to authenticated using(private.execution_read_permission(entity_type) is null or private.execution_access(organization_id,private.execution_read_permission(entity_type)));
revoke all on function private.execution_access(uuid,text),private.execution_require(uuid,text),private.execution_decimal(text),private.execution_read_permission(text) from public,anon,authenticated;
grant execute on function private.execution_access(uuid,text),private.execution_read_permission(text) to authenticated;

insert into public.permissions(id,key,scope,description) select private.seed_uuid('business-os:'||k),k,'organization',replace(k,'.',' ') from unnest(array['estimate.view','estimate.create','estimate.edit','estimate.review','estimate.approve','estimate.view_cost','estimate.override_quantity','estimate.manage_recipes','material.view','material.manage','material_cost.view','material_cost.manage','vendor.view','vendor.manage','purchase_requisition.view','purchase_requisition.create','purchase_requisition.approve','rfq.view','rfq.create','rfq.manage','vendor_quote.view','vendor_quote.manage','purchase_order.view','purchase_order.view_cost','purchase_order.create','purchase_order.issue','purchase_order.manage','goods_receipt.view','goods_receipt.record','cost_report.view']) k on conflict(key) do nothing;
insert into private.role_template_permissions(role_key,permission_key) select r.key,p.key from private.role_templates r cross join public.permissions p where p.key=any(array['estimate.view','estimate.create','estimate.edit','estimate.review','estimate.approve','estimate.view_cost','estimate.override_quantity','estimate.manage_recipes','material.view','material.manage','material_cost.view','material_cost.manage','vendor.view','vendor.manage','purchase_requisition.view','purchase_requisition.create','purchase_requisition.approve','rfq.view','rfq.create','rfq.manage','vendor_quote.view','vendor_quote.manage','purchase_order.view','purchase_order.view_cost','purchase_order.create','purchase_order.issue','purchase_order.manage','goods_receipt.view','goods_receipt.record','cost_report.view']) and (
r.key in ('owner','admin') or
r.key='estimator' and (p.key like 'estimate.%' and p.key<>'estimate.approve' or p.key in ('material.view','material_cost.view','purchase_requisition.view','purchase_requisition.create')) or
r.key='purchase_manager' and (p.key like 'vendor.%' or p.key like 'vendor_quote.%' or p.key like 'purchase_%' or p.key like 'rfq.%' or p.key like 'goods_receipt.%' or p.key in ('estimate.view','estimate.view_cost','material.view','material_cost.view','material_cost.manage','cost_report.view')) or
r.key='project_manager' and p.key in ('estimate.view','estimate.review','estimate.approve','estimate.view_cost','material.view','purchase_requisition.view','purchase_requisition.approve','purchase_order.view','goods_receipt.view','goods_receipt.record') or
r.key='accountant' and p.key in ('estimate.view','estimate.view_cost','material.view','material_cost.view','vendor.view','vendor_quote.view','purchase_order.view','purchase_order.view_cost','goods_receipt.view','cost_report.view') or
r.key in ('interior_designer','site_supervisor') and p.key in ('estimate.view','material.view','purchase_order.view','goods_receipt.view') or r.key='site_supervisor' and p.key='goods_receipt.record'
) on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id) select r.organization_id,r.id,p.id from public.roles r join private.role_template_permissions t on t.role_key=r.key join public.permissions p on p.key=t.permission_key where p.key=any(array['estimate.view','estimate.create','estimate.edit','estimate.review','estimate.approve','estimate.view_cost','estimate.override_quantity','estimate.manage_recipes','material.view','material.manage','material_cost.view','material_cost.manage','vendor.view','vendor.manage','purchase_requisition.view','purchase_requisition.create','purchase_requisition.approve','rfq.view','rfq.create','rfq.manage','vendor_quote.view','vendor_quote.manage','purchase_order.view','purchase_order.view_cost','purchase_order.create','purchase_order.issue','purchase_order.manage','goods_receipt.view','goods_receipt.record','cost_report.view']) on conflict do nothing;
commit;
