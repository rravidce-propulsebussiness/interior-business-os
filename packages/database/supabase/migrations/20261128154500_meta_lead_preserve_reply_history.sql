-- Preserve CRM follow-up history and confirmation-only forms during area collection.
begin;
create or replace function public.meta_lead_reply(
  p_organization_id uuid, p_connection_id uuid, p_wa_id text, p_text text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.meta_lead_events; f public.meta_lead_forms; l public.leads;
  v_answer text; v_mode text;
begin
  if p_wa_id is null or p_wa_id !~ '^[0-9]{8,15}$' then return null; end if;
  select * into e from public.meta_lead_events
    where organization_id = p_organization_id and wa_id = p_wa_id
      and whatsapp_connection_id = p_connection_id
      and whatsapp_status in ('awaiting_confirmation','awaiting_area_method','awaiting_area_value')
      and confirmation_sent_at > now() - interval '7 days'
    order by confirmation_sent_at desc limit 1 for update;
  if e.leadgen_id is null then return null; end if;
  select * into f from public.meta_lead_forms where id = e.form_row_id;
  select * into l from public.leads where organization_id = p_organization_id and id = e.lead_id;
  v_answer := upper(regexp_replace(btrim(coalesce(p_text, '')), '[[:space:].!]+$', ''));

  if e.whatsapp_status = 'awaiting_confirmation' then
    if v_answer not in ('YES','Y','YA','YEAH','YEP','CONFIRM','CONFIRMED','CONFIRM DETAILS','CONFIRM_DETAILS','CORRECT','OK','OKAY','RIGHT','1','HA','HAAN','HAN','AVUNU','SARI') then
      update public.meta_lead_events set whatsapp_status = 'replied' where leadgen_id = e.leadgen_id;
      if l.id is not null then
        perform private.crm_event(p_organization_id, l.id, 'system',
          'Lead replied on WhatsApp instead of confirming their form details: ' || left(coalesce(p_text, ''), 1000),
          jsonb_build_object('meta_leadgen_id', e.leadgen_id));
      end if;
      return jsonb_build_object('action', 'replied');
    end if;
    if l.id is not null then
      perform private.crm_event(p_organization_id, l.id, 'system',
        'Lead confirmed their form details on WhatsApp',
        jsonb_build_object('meta_leadgen_id', e.leadgen_id));
    end if;
    if not f.quote_enabled or f.status <> 'active' then
      update public.meta_lead_events set whatsapp_status = 'confirmed', confirmed_at = now()
        where leadgen_id = e.leadgen_id;
      return jsonb_build_object('action', 'confirmed', 'leadgen_id', e.leadgen_id);
    end if;
    update public.meta_lead_events set whatsapp_status = 'awaiting_area_method', confirmed_at = now()
      where leadgen_id = e.leadgen_id;
    return jsonb_build_object('action', 'ask_area_method', 'leadgen_id', e.leadgen_id);
  end if;

  if e.whatsapp_status = 'awaiting_area_method' then
    v_mode := case
      when lower(btrim(coalesce(p_text, ''))) in ('area:length_width','length x width','length × width','1') then 'length_width'
      when lower(btrim(coalesce(p_text, ''))) in ('area:sqft','square feet','sq ft','sqft','2') then 'sqft'
      when lower(btrim(coalesce(p_text, ''))) in ('area:sqyard','square yards','sq yd','sqyard','3') then 'sqyard'
      else null end;
    if v_mode is null then return jsonb_build_object('action', 'ask_area_method', 'leadgen_id', e.leadgen_id); end if;
    update public.meta_lead_events set whatsapp_status = 'awaiting_area_value', whatsapp_area_mode = v_mode
      where leadgen_id = e.leadgen_id;
    return jsonb_build_object('action', 'ask_area_value', 'leadgen_id', e.leadgen_id, 'area_mode', v_mode);
  end if;

  return jsonb_build_object('action', 'area_value', 'leadgen_id', e.leadgen_id,
    'area_mode', e.whatsapp_area_mode);
end $$;

commit;
