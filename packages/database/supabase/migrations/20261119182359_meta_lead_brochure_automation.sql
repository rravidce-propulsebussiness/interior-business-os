begin;

alter table public.meta_lead_forms
  add column brochure_automation_enabled boolean not null default false,
  add column brochure_automation_connection_id uuid,
  add column brochure_service_template_name text not null default '',
  add column brochure_service_template_language text not null default '',
  add column brochure_carousel_template_name text not null default '',
  add column brochure_carousel_template_language text not null default '',
  add column construction_brochure_url text not null default '',
  add column interiors_brochure_url text not null default '',
  add constraint meta_lead_forms_brochure_automation_check check (
    not brochure_automation_enabled or (
      brochure_automation_connection_id is not null
      and brochure_service_template_name <> ''
      and brochure_service_template_language <> ''
      and brochure_carousel_template_name <> ''
      and brochure_carousel_template_language <> ''
      and construction_brochure_url ~ '^https://'
      and interiors_brochure_url ~ '^https://'
    )
  ),
  add constraint meta_lead_forms_brochure_urls_check check (
    length(construction_brochure_url) <= 2048
    and length(interiors_brochure_url) <= 2048
    and (construction_brochure_url = '' or construction_brochure_url ~ '^https://')
    and (interiors_brochure_url = '' or interiors_brochure_url ~ '^https://')
  );

alter table public.meta_lead_events
  drop constraint meta_lead_events_whatsapp_status_check;
alter table public.meta_lead_events
  add constraint meta_lead_events_whatsapp_status_check check (
    whatsapp_status in (
      'none', 'skipped', 'awaiting_confirmation', 'replied', 'confirmed',
      'quote_sent', 'brochure_sent', 'failed'
    )
  );

create function public.meta_lead_brochure_logged(
  p_organization_id uuid,
  p_leadgen_id text,
  p_connection_id uuid,
  p_sent boolean,
  p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.meta_lead_events;
begin
  select * into e from public.meta_lead_events
    where organization_id = p_organization_id and leadgen_id = p_leadgen_id
    for update;
  if e.leadgen_id is null then raise exception 'Unavailable Meta lead' using errcode = '42501'; end if;
  update public.meta_lead_events set
    whatsapp_connection_id = p_connection_id,
    whatsapp_status = case when p_sent then 'brochure_sent' else 'failed' end,
    whatsapp_error = case when p_sent then null else left(coalesce(p_error, 'WhatsApp brochure was not sent'), 500) end
    where leadgen_id = e.leadgen_id;
  if e.lead_id is not null then
    perform private.crm_event(p_organization_id, e.lead_id, 'system',
      case when p_sent then 'WhatsApp brochure automation sent a service brochure'
           else 'WhatsApp brochure automation failed: ' || left(coalesce(p_error, 'unknown reason'), 300) end,
      jsonb_build_object('meta_leadgen_id', p_leadgen_id));
  end if;
end;
$$;

revoke all on function public.meta_lead_brochure_logged(uuid, text, uuid, boolean, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.meta_lead_brochure_logged(uuid, text, uuid, boolean, text) to service_role;
  end if;
end $$;

commit;
