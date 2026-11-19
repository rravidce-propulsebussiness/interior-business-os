begin;

alter table public.meta_lead_forms
  add column construction_brochure_image_url text not null default '',
  add column interiors_brochure_image_url text not null default '',
  add constraint meta_lead_forms_brochure_image_urls_check check (
    length(construction_brochure_image_url) <= 2048
    and length(interiors_brochure_image_url) <= 2048
    and (construction_brochure_image_url = '' or construction_brochure_image_url ~ '^https://')
    and (interiors_brochure_image_url = '' or interiors_brochure_image_url ~ '^https://')
  );

alter table public.meta_lead_forms
  drop constraint meta_lead_forms_brochure_automation_check,
  add constraint meta_lead_forms_brochure_automation_check check (
    not brochure_automation_enabled or (
      brochure_automation_connection_id is not null
      and brochure_service_template_name <> ''
      and brochure_service_template_language <> ''
      and brochure_carousel_template_name <> ''
      and brochure_carousel_template_language <> ''
      and construction_brochure_url ~ '^https://'
      and interiors_brochure_url ~ '^https://'
      and construction_brochure_image_url ~ '^https://'
      and interiors_brochure_image_url ~ '^https://'
    )
  );

commit;
