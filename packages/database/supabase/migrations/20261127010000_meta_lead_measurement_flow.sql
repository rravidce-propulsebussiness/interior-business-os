begin;

alter table public.meta_lead_events
  add column if not exists whatsapp_area_mode text
  check (whatsapp_area_mode is null or whatsapp_area_mode in ('length_width','sqft','sqyard'));

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
      return jsonb_build_object('action', 'replied');
    end if;
    update public.meta_lead_events set whatsapp_status = 'awaiting_area_method', confirmed_at = now()
      where leadgen_id = e.leadgen_id;
    return jsonb_build_object('action', 'ask_area_method', 'leadgen_id', e.leadgen_id);
  end if;

  if e.whatsapp_status = 'awaiting_area_method' then
    v_mode := case
      when lower(p_text) in ('area:length_width','length x width','length × width','1') then 'length_width'
      when lower(p_text) in ('area:sqft','square feet','sq ft','sqft','2') then 'sqft'
      when lower(p_text) in ('area:sqyard','square yards','sq yd','sqyard','3') then 'sqyard'
      else null end;
    if v_mode is null then return jsonb_build_object('action', 'ask_area_method', 'leadgen_id', e.leadgen_id); end if;
    update public.meta_lead_events set whatsapp_status = 'awaiting_area_value', whatsapp_area_mode = v_mode
      where leadgen_id = e.leadgen_id;
    return jsonb_build_object('action', 'ask_area_value', 'leadgen_id', e.leadgen_id, 'area_mode', v_mode);
  end if;

  return jsonb_build_object('action', 'area_value', 'leadgen_id', e.leadgen_id,
    'area_mode', e.whatsapp_area_mode);
end $$;

create or replace function public.meta_lead_area_confirmed(
  p_organization_id uuid, p_leadgen_id text, p_project_size text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.meta_lead_events; f public.meta_lead_forms; l public.leads; v_packages jsonb;
begin
  select * into e from public.meta_lead_events where organization_id=p_organization_id
    and leadgen_id=p_leadgen_id and whatsapp_status='awaiting_area_value' for update;
  if e.leadgen_id is null or p_project_size !~ '^[0-9,.]+ sq ft$' then return null; end if;
  select * into f from public.meta_lead_forms where id=e.form_row_id;
  select * into l from public.leads where organization_id=p_organization_id and id=e.lead_id;
  update public.meta_lead_events set whatsapp_status='confirmed' where leadgen_id=e.leadgen_id;
  update public.leads set project_size=left(p_project_size,200), updated_at=now(), version=version+1
    where organization_id=p_organization_id and id=e.lead_id;
  if e.lead_id is not null then
    perform private.crm_event(p_organization_id,e.lead_id,'system',
      'Lead provided project area on WhatsApp: '||p_project_size,
      jsonb_build_object('meta_leadgen_id',e.leadgen_id));
  end if;
  if not f.quote_enabled or f.status <> 'active' then return jsonb_build_object('action','confirmed'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'rate_per_sqft',p.rate_per_sqft)
    order by p.rate_per_sqft,p.name),'[]'::jsonb) into v_packages
    from private.construction_quote_packages p where p.organization_id=p_organization_id and p.status='active';
  return jsonb_build_object('action','send_quote','leadgen_id',e.leadgen_id,'lead_name',coalesce(l.name,''),
    'project_size',p_project_size,'quote_message',f.quote_message,'packages',v_packages,
    'company_name',(select name from public.organizations where id=p_organization_id));
end $$;

revoke all on function public.meta_lead_area_confirmed(uuid,text,text)
  from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.meta_lead_area_confirmed(uuid,text,text) to service_role';
  end if;
end $$;

commit;
