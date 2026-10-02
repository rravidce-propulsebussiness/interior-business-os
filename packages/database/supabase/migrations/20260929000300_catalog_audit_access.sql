begin;
-- Audit metadata must not become an alternate route around catalog/pricing/cost access.
drop policy audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using(
 ((organization_id is not null and private.has_permission(organization_id,'organization.audit')) or (organization_id is null and private.has_platform_permission('platform.audit.view')))
 and (entity_type not in ('catalog_categories','catalog_items','catalog_item_attributes','catalog_attribute_options','price_books','price_book_items','pricing_modifiers','pricing_costs') or (private.has_permission(organization_id,'catalog.view') and public.has_entitlement(organization_id,'catalog')))
 and (entity_type not in ('price_books','price_book_items','pricing_modifiers','pricing_costs') or (private.has_permission(organization_id,'pricing.view') and public.has_entitlement(organization_id,'pricing')))
 and (entity_type<>'pricing_costs' or private.has_permission(organization_id,'quotation.view_internal_cost')));
commit;
