begin;
-- Keep existing states and allow both steps used by meta_lead_reply.
alter table public.meta_lead_events
  drop constraint meta_lead_events_whatsapp_status_check;
alter table public.meta_lead_events
  add constraint meta_lead_events_whatsapp_status_check
  check (whatsapp_status in (
    'none', 'skipped', 'awaiting_confirmation', 'awaiting_area_method',
    'awaiting_area_value', 'replied', 'confirmed', 'quote_sent',
    'brochure_sent', 'failed'
  ));
commit;
