-- Quotation Studio: each tenant starts with its OWN name on quotations.
-- Do not overwrite existing quotation configuration, branded logos or terms.
-- This migration intentionally does not copy any SG Homes identity.
begin;

create function private.seed_company_quotation_settings(p_organization_id uuid)
returns void language plpgsql security definer set search_path = ''
as $quote_seed$
begin
  insert into public.organization_quotation_settings (
    organization_id, created_by, prefix, validity_days,
    default_terms, default_customer_notes,
    show_quantity, show_unit_rate, show_specifications, branding
  )
  select o.id, o.created_by, 'Q', 30, '', '',
         true, true, true,
         jsonb_build_object(
           'name', o.name,
           'phone', '',
           'email', '',
           'tax_identifier', '',
           'accent', '#2563EB',
           'logo_data_uri', '',
           'address', jsonb_build_object(
             'line1', '', 'line2', '', 'city', '', 'region', '',
             'postal_code', '', 'country_code', 'IN'
           )
         )
  from public.organizations o
  where o.id = p_organization_id
  on conflict (organization_id) do nothing;
end
$quote_seed$;

revoke all on function private.seed_company_quotation_settings(uuid)
  from public, anon, authenticated;

create function private.seed_quotation_settings_after_organization()
returns trigger language plpgsql security definer set search_path = ''
as $quote_trigger$
begin
  perform private.seed_company_quotation_settings(new.id);
  return new;
end
$quote_trigger$;

revoke all on function private.seed_quotation_settings_after_organization()
  from public, anon, authenticated;

create trigger seed_quotation_settings_after_organization
after insert on public.organizations
for each row execute function private.seed_quotation_settings_after_organization();

do $backfill$
declare v_org uuid;
begin
  for v_org in select id from public.organizations loop
    perform private.seed_company_quotation_settings(v_org);
  end loop;
end
$backfill$;

commit;
