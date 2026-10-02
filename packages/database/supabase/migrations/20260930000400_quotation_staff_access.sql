begin;
-- Staff may select configured catalog items, without receiving pricing-management
-- or internal-cost permissions. Entitlements continue to gate every operation.
insert into private.role_template_permissions(role_key,permission_key) values('sales','catalog.view'),('branch_manager','catalog.view') on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id) select r.organization_id,r.id,p.id from public.roles r cross join public.permissions p where r.key in ('sales','branch_manager') and p.key='catalog.view' on conflict do nothing;
create index quotation_number_prefix on public.quotations(organization_id,lower(quotation_number) text_pattern_ops,id);
commit;
